#include "FastIMU.h"
#include <Wire.h>
#include <math.h>

#define IMU_ADDRESS 0x68
MPU6500 IMU;

calData calib = {0};
AccelData accelData;

unsigned long lastStepTime = 0;
int stepCount = 0;

// Tunable parameters
const float stepThreshold = 0.20;   // g units above baseline
const int stepDebounceMs = 300;     // ms between steps

// Auto-learned baseline
float baseline = 1.0;

// State for zero-crossing detection
bool aboveThreshold = false;

void setup() {
  Wire.begin();
  Wire.setClock(400000);
  Serial.begin(115200);

  int err = IMU.init(calib, IMU_ADDRESS);
  if (err != 0) {
    Serial.print("IMU init failed: ");
    Serial.println(err);
    while (1);
  }

  // Auto baseline calibration
  long samples = 0;
  float sum = 0;
  Serial.println("Calibrating baseline... keep IMU still");
  for (int i = 0; i < 200; i++) {   // ~2 sec at 10ms
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

  Serial.println("MPU6500 Pedometer ready");
}

void loop() {
  IMU.update();
  IMU.getAccel(&accelData);

  // Accel magnitude in g
  float aMag = sqrt(
    accelData.accelX * accelData.accelX +
    accelData.accelY * accelData.accelY +
    accelData.accelZ * accelData.accelZ
  ) / 9.81;

  // Dynamic acceleration vs baseline
  float aDyn = aMag - baseline;
  if (aDyn < 0) aDyn = -aDyn; // absolute value

  unsigned long now = millis();

  // Zero-crossing detection
  if (!aboveThreshold && aDyn > stepThreshold) {
    // crossed upwards
    aboveThreshold = true;
  }
  else if (aboveThreshold && aDyn < stepThreshold) {
    // crossed downwards → valid peak
    if ((now - lastStepTime) > stepDebounceMs) {
      stepCount++;
      lastStepTime = now;
    }
    aboveThreshold = false;
  }

  // Print live step count
  Serial.print("Steps: ");
  Serial.print(stepCount);
  Serial.print("\t DynAccel: ");
  Serial.println(aDyn, 3);

  delay(50); // ~20 Hz
}
