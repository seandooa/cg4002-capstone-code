#include "imu_handler.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

enum RepState { RESTING, LIFTING, LOWERING };
RepState repState = RESTING;
int repCount = 0;

// (Your threshold constants go here or in the .h file)

// Helper function, internal to this file
void processRep(float angle, float startThreshold, float endThreshold, bool inverted) {
  switch (repState) {
    case RESTING:
      // If inverted: transition when angle < start (e.g., 159 < 160)
      if ((!inverted && angle > startThreshold) || (inverted && angle < startThreshold))
        repState = LIFTING;
      break;

    case LIFTING:
      // If inverted: transition when angle < end (e.g., 109 < 110)
      if ((!inverted && angle > endThreshold) || (inverted && angle < endThreshold))
        repState = LOWERING;
      // Return to rest if movement is reversed
      else if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold))
        repState = RESTING;
      break;

    case LOWERING:
      // If inverted: count when angle > start (e.g., 161 > 160)
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

  // MODIFIED: This "pitch" angle calculation works for both
  // Bicep Curl (180 -> ~0) and Lateral Raise (180 -> 90)
  angle = map(atan2(-a.acceleration.x,
                    sqrt(pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2))) * 180 / PI,
              -90, 90, 0, 180);
  
  // The "roll" calculation was incorrect for your sensor's orientation
  // if (currentMode == LATERAL_RAISE) { ... } else { ... } block is removed.

  switch (currentMode) {
    case BICEP_CURL:
      // Bicep curl: inverted logic (180 -> 50)
      processRep(angle, BICEP_CURL_START_ANGLE, BICEP_CURL_END_ANGLE, true);
      break;
    case LATERAL_RAISE:
      // MODIFIED: Lateral raise: inverted logic (180 -> 90)
      processRep(angle, LATERAL_RAISE_START_ANGLE, LATERAL_RAISE_END_ANGLE, true);
      break;
    case SQUAT:
      // This will still not work correctly
      processRep(angle, SQUAT_START_ANGLE, SQUAT_END_ANGLE, false);
      break;
    default:
      break;
  }
}

int get_rep_count() {
  return repCount;
}

void reset_reps() {
  repCount = 0;
  repState = RESTING;
}