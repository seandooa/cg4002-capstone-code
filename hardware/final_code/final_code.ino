#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// BLE Libraries
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- BLE ---
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// --- MAX30105 Heart Rate Sensor ---
MAX30105 particleSensor;
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg = 0;

// --- MPU6050 ---
Adafruit_MPU6050 mpu;

// --- OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- Button ---
#define BUTTON_PIN 25
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 300;

// --- Modes ---
enum Mode {
  HR_ONLY,
  BICEP_CURL,
  LATERAL_RAISE,
  SQUAT
};
Mode currentMode = HR_ONLY;

// --- Rep Counting ---
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

// --- Animation ---
unsigned long lastAnimationTime = 0;
const unsigned long animationDuration = 100;

// --- Heart Icons (Bitmap data) ---
static const unsigned char PROGMEM logo2_bmp[] = { /* Bitmap data */ };
static const unsigned char PROGMEM logo3_bmp[] = { /* Bitmap data */ };

// --- Exercise Start Logic Variables ---
unsigned long exerciseModeStartTime = 0;
bool exerciseStarted = false;
const unsigned long startDelay = 5000; // 5 seconds

// --- State tracking variables for BLE ---
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


void setup() {
  Serial.begin(115200);
  delay(100);

  // --- OLED Init ---
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  display.display();
  delay(1000);

  // --- MAX30105 Init ---
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30105 was not found.");
    while (1);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);

  // --- MPU6050 Init ---
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) delay(10);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  delay(100);

  // --- Button Init ---
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // --- BLE Init ---
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


void loop() {
  // --- Button Mode Switch ---
  if (digitalRead(BUTTON_PIN) == LOW) {
    if (millis() - lastButtonPress > debounceDelay) {
      currentMode = static_cast<Mode>((currentMode + 1) % 4);
      repCount = 0; 
      repState = RESTING;
      lastButtonPress = millis();
      
      exerciseStarted = false; 
      if (currentMode != HR_ONLY) {
          exerciseModeStartTime = millis(); 
      }
    }
  }

  // --- Read Heart Rate ---
  long irValue = particleSensor.getIR();
  if (irValue > 7000) {
    if (checkForBeat(irValue)) {
        lastAnimationTime = millis();
        long delta = millis() - lastBeat;
        lastBeat = millis();
        beatsPerMinute = 60 / (delta / 1000.0);

        if (beatsPerMinute > 20 && beatsPerMinute < 255) {
            rates[rateSpot++] = (byte)beatsPerMinute;
            rateSpot %= RATE_SIZE;
            beatAvg = 0;
            for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
            beatAvg /= RATE_SIZE;
        }
    }
  } else {
    beatAvg = 0;
  }

  // --- Read MPU6050 for rep counting ---
  if (currentMode != HR_ONLY && exerciseStarted) {
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

  // --- Check if exercise should be marked as "started" ---
  if (currentMode != HR_ONLY && !exerciseStarted) {
    if (millis() - exerciseModeStartTime > startDelay) {
      exerciseStarted = true;
    }
  }

  // --- Display Logic ---
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  // --- MODIFIED: Display formatting now matches the example code exactly ---
  switch (currentMode) {
    case HR_ONLY:
      display.println("Mode: HR Only");
      if (irValue < 7000) {
        display.setCursor(10, 25);
        display.println("Place finger on sensor");
      } else {
        if (millis() - lastAnimationTime < animationDuration) {
          display.drawBitmap(2, 12, logo3_bmp, 32, 32, SSD1306_WHITE);
        } else {
          display.drawBitmap(5, 15, logo2_bmp, 24, 21, SSD1306_WHITE);
        }
        display.setTextSize(2);
        display.setCursor(50, 12); display.println("BPM");
        display.setCursor(50, 32); display.println(beatAvg);
      }
      break;

    case BICEP_CURL:
      display.println("Mode: Bicep Curl");
      if (exerciseStarted) {
        display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      } else {
        display.setTextSize(2); display.setCursor(10, 20); display.println("Get Ready");
        int countdown = (startDelay - (millis() - exerciseModeStartTime)) / 1000;
        display.setTextSize(3); display.setCursor(55, 40); display.println(countdown + 1);
      }
      break;

    case LATERAL_RAISE:
      display.println("Mode: Lat Raise");
      if (exerciseStarted) {
        display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      } else {
        display.setTextSize(2); display.setCursor(10, 20); display.println("Get Ready");
        int countdown = (startDelay - (millis() - exerciseModeStartTime)) / 1000;
        display.setTextSize(3); display.setCursor(55, 40); display.println(countdown + 1);
      }
      break;
      
    case SQUAT:
      display.println("Mode: Squat");
      if (exerciseStarted) {
        display.setTextSize(2); display.setCursor(0, 30); display.print("Reps: "); display.println(repCount);
      } else {
        display.setTextSize(2); display.setCursor(10, 20); display.println("Get Ready");
        int countdown = (startDelay - (millis() - exerciseModeStartTime)) / 1000;
        display.setTextSize(3); display.setCursor(55, 40); display.println(countdown + 1);
      }
      break;
  }

  // Show HR in the bottom right corner during exercises if a finger is detected
  if (currentMode != HR_ONLY && irValue > 7000) {
    display.setTextSize(1);
    display.setCursor(80, 50);
    display.print("HR: "); display.println(beatAvg);
  }

  display.display();


  // --- Event-Driven BLE Data Transmission ---
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
  }

  // Handle disconnects by restarting advertising
  if (!deviceConnected) {
      pServer->startAdvertising();
  }
}

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
