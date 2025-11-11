#ifndef IMU_HANDLER_H
#define IMU_HANDLER_H

#include "config.h"

// --- Arm Exercise Thresholds ---
const float BICEP_CURL_START_ANGLE = 140.0;
const float BICEP_CURL_END_ANGLE   = 50.0;
const float LATERAL_RAISE_START_ANGLE = 150.0;
const float LATERAL_RAISE_END_ANGLE   = 125.0;

// --- NEW: Squat Acceleration Thresholds (in m/s^2) ---
// Resting value is ~9.8. These are now based on magnitude.
const float SQUAT_DOWN_THRESHOLD = 5;  // (i.e., < 8.5) "Unweighted"
const float SQUAT_UP_THRESHOLD   = 11; // (i.e., > 11.5) "Pushing up"
void setup_imu();
void update_rep_counter(Mode currentMode);
int get_rep_count();
void reset_reps();

#endif