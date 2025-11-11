#ifndef IMU_HANDLER_H
#define IMU_HANDLER_H

#include "config.h"

// --- Thresholds ---
const float BICEP_CURL_START_ANGLE = 140.0;
const float BICEP_CURL_END_ANGLE   = 50.0;

// MODIFIED: Leeway for lateral raise (180 -> 90)
const float LATERAL_RAISE_START_ANGLE = 150.0;  // Start rep when angle < 150
const float LATERAL_RAISE_END_ANGLE   = 125.0;  // End lift when angle < 125

const float SQUAT_START_ANGLE = 5.0;
const float SQUAT_END_ANGLE   = 75.0;

void setup_imu();
void update_rep_counter(Mode currentMode);
int get_rep_count();
void reset_reps();

#endif