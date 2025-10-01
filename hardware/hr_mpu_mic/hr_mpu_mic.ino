#include <Wire.h>
#include <math.h>
#include <MAX3010x.h>
#include "filters.h"
#include "FastIMU.h"
#include <driver/i2s.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>

// ===================== BLE CONFIG =====================
#define SERVICE_UUID        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer *pServer;
BLECharacteristic *pCharacteristic;

void BLESend(String data) {
  Serial.print(data); // also print for debugging
  pCharacteristic->setValue(data.c_str());
  pCharacteristic->notify();
}

// ===================== VITALS VARIABLES =====================
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

int latest_bpm = 0;
float latest_spo2 = 0;
float latest_r = 0;
bool new_heartbeat = false;

// ===================== MPU6500 STEP VARIABLES =====================
#define IMU_ADDRESS 0x68
MPU6500 IMU;
calData calib = {0};
AccelData accelData;

unsigned long lastStepTime = 0;
int stepCount = 0;

const float stepThreshold = 0.20;   // g units above baseline
const int stepDebounceMs = 300;

float baseline = 1.0;
bool aboveThreshold = false;
float latest_dynAccel = 0;
bool new_step = false;

unsigned long lastHRTime = 0;      // ~400 Hz
unsigned long lastStepCheck = 0;  // ~50 Hz

// ===================== MICROPHONE VARIABLES =====================
#define I2S_WS 17
#define I2S_SCK 14
#define I2S_SD 4
#define GAIN 0.2
#define THRESHOLD 5000
#define CLIP 10000
#define SMOOTHING 20
#define DOWNSAMPLE 100
#define BT_CHUNK 16

i2s_config_t i2s_config = {
  .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = 16000,
  .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
  .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
  .communication_format = I2S_COMM_FORMAT_I2S_MSB,
  .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
  .dma_buf_count = 4,
  .dma_buf_len = 256,
  .use_apll = false
};

i2s_pin_config_t pin_config = {
  .bck_io_num = I2S_SCK,
  .ws_io_num = I2S_WS,
  .data_out_num = I2S_PIN_NO_CHANGE,
  .data_in_num = I2S_SD
};

int32_t smoothBuffer[SMOOTHING] = {0};
int smoothIndex = 0;
int downsampleCounter = 0;
int32_t btBuffer[BT_CHUNK];
int btIndex = 0;

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);

  // ---------- BLE ----------
  BLEDevice::init("ESP32_MultiSensor");
  pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
  Serial.println("BLE ready!");

  // ---------- Vitals Setup ----------
  if (!sensor.begin() || !sensor.setSamplingRate(kSamplingRate)) {
    BLESend("MAX3010x not found!");
    while(1);
  }
  if (IMU.init(calib, IMU_ADDRESS) != 0) {
    BLESend("IMU init failed!");
    while(1);
  }

  // Calibrate IMU baseline
  BLESend("Calibrating IMU baseline, keep still...");
  float sum = 0;
  for (int i=0;i<200;i++){
    IMU.update();
    IMU.getAccel(&accelData);
    float aMag = sqrt(accelData.accelX*accelData.accelX +
                      accelData.accelY*accelData.accelY +
                      accelData.accelZ*accelData.accelZ)/9.81;
    sum += aMag;
    delay(10);
  }
  baseline = sum/200;
  BLESend("Baseline set: " + String(baseline,3));
  BLESend("Vitals ready!");

  // ---------- Microphone Setup ----------
  i2s_driver_install(I2S_NUM_0,&i2s_config,0,NULL);
  i2s_set_pin(I2S_NUM_0,&pin_config);
  BLESend("Mic ready (plotter mode).");
}

// ===================== LOOP =====================
void loop() {
  unsigned long now = millis();

  // -------------------- HR Sampling --------------------
  if(now - lastHRTime >= 2){
    lastHRTime = now;
    auto sample = sensor.readSample(0);
    float red = sample.red;
    float ir = sample.ir;

    if(red>kFingerThreshold){
      if(now-finger_timestamp>kFingerCooldownMs) finger_detected=true;
    } else {
      differentiator.reset();
      low_pass_filter_red.reset();
      low_pass_filter_ir.reset();
      high_pass_filter.reset();
      stat_red.reset();
      stat_ir.reset();
      finger_detected=false;
      finger_timestamp=now;
    }

    if(finger_detected){
      red=low_pass_filter_red.process(red);
      ir=low_pass_filter_ir.process(ir);
      stat_red.process(red);
      stat_ir.process(ir);

      float current_val = high_pass_filter.process(red);
      float current_diff = differentiator.process(current_val);

      static float last_diff_local = NAN;
      static bool crossed_local=false;
      static long crossed_time_local=0;

      if(!isnan(current_diff) && !isnan(last_diff_local)){
        if(last_diff_local>0 && current_diff<0){
          crossed_local=true;
          crossed_time_local=now;
        }
        if(current_diff>0) crossed_local=false;

        if(crossed_local && current_diff<kEdgeThreshold){
          if(last_heartbeat!=0 && crossed_time_local-last_heartbeat>300){
            int bpm=60000/(crossed_time_local-last_heartbeat);
            float rred=(stat_red.maximum()-stat_red.minimum())/stat_red.average();
            float rir=(stat_ir.maximum()-stat_ir.minimum())/stat_ir.average();
            float r=rred/rir;
            float spo2=kSpO2_A*r*r + kSpO2_B*r + kSpO2_C;

            if(bpm>50 && bpm<250){
              latest_bpm=bpm;
              latest_r=r;
              latest_spo2=spo2;
              new_heartbeat=true;
            }
            stat_red.reset(); stat_ir.reset();
          }
          crossed_local=false;
          last_heartbeat=crossed_time_local;
        }
      }
      last_diff_local=current_diff;
    }
  }

  // -------------------- Step Counting --------------------
  if(now - lastStepCheck >= 20){
    lastStepCheck=now;
    IMU.update(); IMU.getAccel(&accelData);
    float aMag=sqrt(accelData.accelX*accelData.accelX +
                    accelData.accelY*accelData.accelY +
                    accelData.accelZ*accelData.accelZ)/9.81;
    float aDyn=fabs(aMag-baseline);
    latest_dynAccel=aDyn;

    if(!aboveThreshold && aDyn>stepThreshold) aboveThreshold=true;
    else if(aboveThreshold && aDyn<stepThreshold){
      if(now-lastStepTime>stepDebounceMs){
        stepCount++; lastStepTime=now; new_step=true;
      }
      aboveThreshold=false;
    }
  }

  // -------------------- Microphone Sampling --------------------
  const int buffer_len=256; int32_t buffer[buffer_len]; size_t bytes_read=0;
  if(i2s_read(I2S_NUM_0,(char*)buffer,sizeof(buffer),&bytes_read,0)==ESP_OK && bytes_read>0){
    int samples=bytes_read/4;
    for(int i=0;i<samples;i++){
      int32_t sample=buffer[i]>>8;
      sample*=GAIN;
      if(abs(sample)<THRESHOLD) sample=0;
      if(sample>CLIP) sample=CLIP;
      if(sample<-CLIP) sample=-CLIP;

      smoothBuffer[smoothIndex]=sample;
      smoothIndex=(smoothIndex+1)%SMOOTHING;

      int32_t sum=0;
      for(int j=0;j<SMOOTHING;j++) sum+=smoothBuffer[j];
      int32_t smoothSample=sum/SMOOTHING;

      downsampleCounter++;
      if(downsampleCounter>=DOWNSAMPLE){
        btBuffer[btIndex++]=smoothSample;
        downsampleCounter=0;

        if(btIndex>=BT_CHUNK){
          // -------------------- Send all data --------------------
          String out = "{";
          out += "\"time\":" + String(now) + ",";
          out += "\"bpm\":" + String(latest_bpm) + ",";
          out += "\"spo2\":" + String(latest_spo2,1) + ",";
          out += "\"steps\":" + String(stepCount) + ",";
          out += "\"mic\":[";
          for(int k=0;k<BT_CHUNK;k++){
            out += String(btBuffer[k]);
            if(k<BT_CHUNK-1) out += ",";
          }
          out += "]}";
          BLESend(out);
          btIndex=0;
        }
      }
    }
  }
  delay(1);
}
