#include <Wire.h>
#include <math.h>
#include <MAX3010x.h>
#include "filters.h"
#include "FastIMU.h"

// ===================== MAX3010x Pulse Oximeter =====================
MAX30105 sensor;
const auto kSamplingRate = sensor.SAMPLING_RATE_400SPS;
const float kSamplingFrequency = 400.0;

const unsigned long kFingerThreshold = 10000;
const unsigned int kFingerCooldownMs = 500;
const float kEdgeThreshold = -2000.0;

const float kLowPassCutoff = 5.0;
const float kHighPassCutoff = 0.5;

LowPassFilter low_pass_filter_red(kLowPassCutoff, kSamplingFrequency);
LowPassFilter low_pass_filter_ir(kLowPassCutoff, kSamplingFrequency);
HighPassFilter high_pass_filter(kHighPassCutoff, kSamplingFrequency);
Differentiator differentiator(kSamplingFrequency);

MinMaxAvgStatistic stat_red;
MinMaxAvgStatistic stat_ir;

float kSpO2_A = 1.5958422;
float kSpO2_B = -34.6596622;
float kSpO2_C = 112.6898759;

long last_heartbeat = 0;
long finger_timestamp = 0;
bool finger_detected = false;
float last_diff = NAN;
bool crossed = false;
long crossed_time = 0;

// Latest HR results
int latest_bpm = 0;
float latest_spo2 = 0;
float latest_r = 0;
bool new_heartbeat = false;

// ===================== MPU6500 Pedometer =====================
#define IMU_ADDRESS 0x68
MPU6500 IMU;

calData calib = {0};
AccelData accelData;

unsigned long lastStepTime = 0;
int stepCount = 0;

const float stepThreshold = 0.20;   // g units above baseline
const int stepDebounceMs = 300;     // ms between steps

float baseline = 1.0;
bool aboveThreshold = false;
float latest_dynAccel = 0;
bool new_step = false;

// ===================== TIMERS =====================
unsigned long lastHRTime = 0;      // timing for HR sampling (~400 Hz)
unsigned long lastStepCheck = 0;  // timing for step checking (~50 Hz)

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);

  if (sensor.begin() && sensor.setSamplingRate(kSamplingRate)) {
    Serial.println("MAX3010x initialized");
  } else {
    Serial.println("MAX3010x not found");
    while (1);
  }

  int err = IMU.init(calib, IMU_ADDRESS);
  if (err != 0) {
    Serial.print("IMU init failed: ");
    Serial.println(err);
    while (1);
  }

  // Calibrate baseline
  long samples = 0;
  float sum = 0;
  Serial.println("Calibrating baseline... keep IMU still");
  for (int i = 0; i < 200; i++) {
    IMU.update();
    IMU.getAccel(&accelData);
    float aMag = sqrt(
      accelData.accelX*accelData.accelX +
      accelData.accelY*accelData.accelY +
      accelData.accelZ*accelData.accelZ
    ) / 9.81;
    sum += aMag;
    samples++;
    delay(10);
  }
  baseline = sum / samples;
  Serial.print("Baseline set to: ");
  Serial.println(baseline, 3);

  Serial.println("Both sensors ready!");
  Serial.println("---------------------------------------");
}

// ===================== LOOP =====================
void loop() {
  unsigned long now = millis();

  // ---------- HR Sampling (~400 Hz) ----------
  if (now - lastHRTime >= 2) {  // 2.5 ms ~ 400 Hz
    lastHRTime = now;

    auto sample = sensor.readSample(0); // non-blocking read if supported
    float current_value_red = sample.red;
    float current_value_ir = sample.ir;

    // Finger detection
    if (sample.red > kFingerThreshold) {
      if (now - finger_timestamp > kFingerCooldownMs) finger_detected = true;
    } else {
      differentiator.reset();
      low_pass_filter_red.reset();
      low_pass_filter_ir.reset();
      high_pass_filter.reset();
      stat_red.reset();
      stat_ir.reset();
      finger_detected = false;
      finger_timestamp = now;
    }

    if (finger_detected) {
      current_value_red = low_pass_filter_red.process(current_value_red);
      current_value_ir = low_pass_filter_ir.process(current_value_ir);
      stat_red.process(current_value_red);
      stat_ir.process(current_value_ir);

      float current_value = high_pass_filter.process(current_value_red);
      float current_diff = differentiator.process(current_value);

      if (!isnan(current_diff) && !isnan(last_diff)) {
        if (last_diff > 0 && current_diff < 0) {
          crossed = true;
          crossed_time = now;
        }
        if (current_diff > 0) crossed = false;

        if (crossed && current_diff < kEdgeThreshold) {
          if (last_heartbeat != 0 && crossed_time - last_heartbeat > 300) {
            int bpm = 60000 / (crossed_time - last_heartbeat);
            float rred = (stat_red.maximum() - stat_red.minimum()) / stat_red.average();
            float rir = (stat_ir.maximum() - stat_ir.minimum()) / stat_ir.average();
            float r = rred / rir;
            float spo2 = kSpO2_A * r * r + kSpO2_B * r + kSpO2_C;

            if (bpm > 50 && bpm < 250) {
              latest_bpm = bpm;
              latest_r = r;
              latest_spo2 = spo2;
              new_heartbeat = true;
            }

            stat_red.reset();
            stat_ir.reset();
          }
          crossed = false;
          last_heartbeat = crossed_time;
        }
      }
      last_diff = current_diff;
    }
  }

  // ---------- Step Counting (~50 Hz) ----------
  if (now - lastStepCheck >= 20) {
    lastStepCheck = now;

    IMU.update();
    IMU.getAccel(&accelData);

    float aMag = sqrt(
      accelData.accelX*accelData.accelX +
      accelData.accelY*accelData.accelY +
      accelData.accelZ*accelData.accelZ
    ) / 9.81;

    float aDyn = fabs(aMag - baseline);
    latest_dynAccel = aDyn;

    if (!aboveThreshold && aDyn > stepThreshold) {
      aboveThreshold = true;
    } else if (aboveThreshold && aDyn < stepThreshold) {
      if ((now - lastStepTime) > stepDebounceMs) {
        stepCount++;
        lastStepTime = now;
        new_step = true;
      }
      aboveThreshold = false;
    }
  }

  // ---------- Print updates ----------
  if (new_heartbeat || new_step) {
    Serial.print("[");
    Serial.print(now);
    Serial.println(" ms]");

    if (finger_detected && new_heartbeat) {
      Serial.print("  Heart Rate (bpm): ");
      Serial.println(latest_bpm);
      Serial.print("  R-Value: ");
      Serial.println(latest_r, 3);
      Serial.print("  SpO2 (%): ");
      Serial.println(latest_spo2, 1);
    }

    Serial.print("  Steps: ");
    Serial.println(stepCount);
    Serial.print("  DynAccel (g): ");
    Serial.println(latest_dynAccel, 3);

    Serial.println("---------------------------------------");

    new_heartbeat = false;
    new_step = false;
  }
}
