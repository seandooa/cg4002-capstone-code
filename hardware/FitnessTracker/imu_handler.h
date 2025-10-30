#ifndef IMU_HANDLER_H
#define IMU_HANDLER_H

#include "config.h"

void setup_imu();
void update_rep_counter(Mode currentMode);
int get_rep_count();
void reset_reps();

#endif