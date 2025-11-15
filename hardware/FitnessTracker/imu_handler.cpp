#include "imu_handler.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h> 

Adafruit_MPU6050 mpu;

// --- State for Arm Exercises ---
enum RepState { RESTING, LIFTING, LOWERING };
RepState repState = RESTING;

// --- State for Squat Exercise ---
enum SquatState { SQUAT_REST, SQUATTING_DOWN, SQUATTING_UP };
SquatState squatState = SQUAT_REST;

int repCount = 0;

// --- Helper for Arm Exercises ---
void processRep(float angle, float startThreshold, float endThreshold, bool inverted) {
  switch (repState) {
    case RESTING:
      if ((!inverted && angle > startThreshold) || (inverted && angle < startThreshold))
        repState = LIFTING;
      break;
    case LIFTING:
      if ((!inverted && angle > endThreshold) || (inverted && angle < endThreshold))
        repState = LOWERING;
      else if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold))
        repState = RESTING;
      break;
    case LOWERING:
      if ((!inverted && angle < startThreshold) || (inverted && angle > startThreshold)) {
        repCount++;
        repState = RESTING;
      }
      break;
  }
}

void processSquat(float magnitude) {
  switch (squatState) {
    case SQUAT_REST:
      // We are standing. Wait for the "down" motion (mag < 8.5).
      // This is the "Down-Accel"
      if (magnitude < SQUAT_DOWN_THRESHOLD) {
        squatState = SQUATTING_DOWN;
      }
      break;

    case SQUATTING_DOWN:
      // We are down. Wait for the "up" motion (mag > 11.5).
      // This is the "Down-Brake" OR "Up-Accel"
      if (magnitude > SQUAT_UP_THRESHOLD) {
        squatState = SQUATTING_UP;
      }
      break;

    case SQUATTING_UP:
      // We are in the "up" motion (or paused).
      // Wait for the "brake" at the top (mag < 8.5).
      // This signifies the *end* of the rep and the start of the next.
      if (magnitude < SQUAT_DOWN_THRESHOLD) {
        repCount++; // Count the completed rep.
        // We are now at the start of the next rep's "down" motion.
        squatState = SQUATTING_DOWN; 
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

  if (currentMode == SQUAT) {
    float magnitude = sqrt(pow(a.acceleration.x, 2) + 
                         pow(a.acceleration.y, 2) + 
                         pow(a.acceleration.z, 2));
    processSquat(magnitude);

  } else {
    float angle = map(atan2(-a.acceleration.x,
                      sqrt(pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2))) * 180 / PI,
                -90, 90, 0, 180);

    switch (currentMode) {
      case BICEP_CURL:
        processRep(angle, BICEP_CURL_START_ANGLE, BICEP_CURL_END_ANGLE, true);
        break;
      case LATERAL_RAISE:
        processRep(angle, LATERAL_RAISE_START_ANGLE, LATERAL_RAISE_END_ANGLE, true);
        break;
      default:
        break;
    }
  }
}

int get_rep_count() {
  return repCount;
}

void reset_reps() {
  repCount = 0;
  repState = RESTING;
  squatState = SQUAT_REST;
}