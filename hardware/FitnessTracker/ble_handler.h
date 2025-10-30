#ifndef BLE_HANDLER_H
#define BLE_HANDLER_H

#include "config.h"

void setup_ble();
void send_ble_data(Mode currentMode, int beatAvg, int repCount, bool exerciseStarted);

#endif