#include "imu_handler.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

enum RepState { RESTING, LIFTING, LOWERING };
RepState repState = RESTING;
int repCount = 0;

// --- Thresholds ---
const float BICEP_CURL_START_ANGLE = 140.0;
const float BICEP_CURL_END_ANGLE = 50.0;
const float LATERAL_RAISE_START_ANGLE = 15.0;
const float LATERAL_RAISE_END_ANGLE = 80.0;
const float SQUAT_START_ANGLE = 5.0;
const float SQUAT_END_ANGLE = 75.0;

// Helper function, internal to this file
void processRep(float angle, float startThreshold, float endThreshold, bool inverted) {
  switch (repState) {
    case RESTING:
      if ((!inverted && angle > startThreshold) || (inverted && angle < startThreshold)) repState = LIFTING;
      break;
    case LIFTING:
      if ((!inverted && angle > endThreshold) || (inverted && angle < endThreshold)) repState = LOWERING;
      else if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold)) repState = RESTING;
      break;
    case LOWERING:
      if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold)) {
        repCount++;
        repState = RESTING;
      }
      break;
  }
}

void setup_imu() {
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) delay(10);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  delay(100);
}

void update_rep_counter(Mode currentMode) {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  float angle = 0;

  if (currentMode == LATERAL_RAISE) {
    angle = abs(atan2(a.acceleration.y, a.acceleration.z) * 180 / PI);
  } else {
    angle = map(atan2(-a.acceleration.x, sqrt(pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2))) * 180 / PI, -90, 90, 0, 180);
  }
  
  switch (currentMode) {
    case BICEP_CURL:    processRep(angle, BICEP_CURL_START_ANGLE, BICEP_CURL_END_ANGLE, true); break;
    case LATERAL_RAISE: processRep(angle, LATERAL_RAISE_START_ANGLE, LATERAL_RAISE_END_ANGLE, false); break;
    case SQUAT:         processRep(angle, SQUAT_START_ANGLE, SQUAT_END_ANGLE, false); break;
    default: break;
  }
}

int get_rep_count() {
  return repCount;
}

void reset_reps() {
  repCount = 0;
  repState = RESTING;
}