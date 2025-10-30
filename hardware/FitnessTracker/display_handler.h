#ifndef DISPLAY_HANDLER_H
#define DISPLAY_HANDLER_H

#include "config.h"

void setup_display();
void update_display(Mode currentMode, int beatAvg, int repCount, bool exerciseStarted, unsigned long exerciseModeStartTime, int batteryPercent);

#endif