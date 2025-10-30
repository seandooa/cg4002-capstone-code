#include "ble_handler.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>

// --- BLE ---
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// --- State tracking for efficient sending ---
Mode lastSentMode = HR_ONLY;
int lastSentHR = -1;
int lastSentReps = -1;
bool lastSentStart = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      lastSentHR = -1; 
      lastSentReps = -1;
      lastSentStart = false;
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
    }
};

void setup_ble() {
  BLEDevice::init("ESP32 Fitness Tracker");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection to notify...");
}

void send_ble_data(Mode currentMode, int beatAvg, int repCount, bool exerciseStarted) {
  if (deviceConnected) {
    if (currentMode != lastSentMode || beatAvg != lastSentHR || repCount != lastSentReps || exerciseStarted != lastSentStart) {
      StaticJsonDocument<200> doc;
      String modeName = "HR Only";
      switch(currentMode) {
          case BICEP_CURL: modeName = "Bicep Curl"; break;
          case LATERAL_RAISE: modeName = "Lat Raise"; break;
          case SQUAT: modeName = "Squat"; break;
      }
      doc["mode"] = modeName;
      doc["hr"] = beatAvg;
      doc["reps"] = repCount;
      doc["start"] = exerciseStarted;

      String output;
      serializeJson(doc, output);
      
      pCharacteristic->setValue(output.c_str());
      pCharacteristic->notify();
      Serial.println("Change detected, sent: " + output);

      lastSentMode = currentMode;
      lastSentHR = beatAvg;
      lastSentReps = repCount;
      lastSentStart = exerciseStarted;
    }
  } else {
    // Handle disconnects by restarting advertising
    pServer->startAdvertising();
  }
}