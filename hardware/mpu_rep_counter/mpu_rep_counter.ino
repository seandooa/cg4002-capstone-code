#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_MPU6050 mpu;

// --- BLE Configuration ---
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic* pCharacteristic;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// --- Button Configuration ---
#define BUTTON_PIN 25
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 300; // ms

// --- Exercise Configuration ---
enum ExerciseMode {
  BICEP_CURL,
  LATERAL_RAISE,
  SQUAT
};

ExerciseMode currentExercise = BICEP_CURL; // Starting exercise
int repCount = 0;

// --- State Machine for Rep Counting ---
enum RepState {
  RESTING,
  LIFTING,
  LOWERING
};

RepState repState = RESTING;

// --- Thresholds for Angles ---
const float BICEP_CURL_START_ANGLE = 140.0; 
const float BICEP_CURL_END_ANGLE = 50.0;   
const float LATERAL_RAISE_START_ANGLE = 15.0;
const float LATERAL_RAISE_END_ANGLE = 80.0; 
const float SQUAT_START_ANGLE = 5.0;    
const float SQUAT_END_ANGLE = 75.0;   

// --- OLED Display Configuration ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- BLE Server Callbacks ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; }
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; }
};

const char* getExerciseString(ExerciseMode mode) {
  switch (mode) {
    case BICEP_CURL: return "Bicep Curl";
    case LATERAL_RAISE: return "Lateral Raise";
    case SQUAT: return "Squat";
    default: return "Unknown";
  }
}

void updateAndPrintState() {
  // Print to Serial Monitor
  Serial.println("--------------------");
  Serial.print("Current Exercise: ");
  Serial.println(getExerciseString(currentExercise));
  Serial.print("Rep Count: ");
  Serial.println(repCount);
  Serial.println("--------------------");

  // Update BLE Characteristic
  if (deviceConnected) {
    char dataString[50];
    snprintf(dataString, sizeof(dataString), "%s,%d", getExerciseString(currentExercise), repCount);
    pCharacteristic->setValue(dataString);
    pCharacteristic->notify();
    Serial.print("Notifying value: ");
    Serial.println(dataString);
  }

  // Update OLED Display
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10);
  display.println("Exercise:");
  display.setTextSize(2);
  display.setCursor(0, 25);
  display.println(getExerciseString(currentExercise));
  display.setTextSize(1);
  display.setCursor(0, 50);
  display.print("Reps: ");
  display.println(repCount);
  display.display();
}

void setup(void) {
  Serial.begin(115200);
  while (!Serial) delay(10); 

  Serial.println("Exercise Rep Counter Initializing...");

  // --- MPU6050 Setup ---
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) { delay(10); }
  }
  Serial.println("MPU6050 Found!");
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  delay(100);

  // --- OLED Setup ---
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // Default I2C address 0x3C
    Serial.println(F("SSD1306 allocation failed"));
    while(1);
  }
  display.clearDisplay();
  display.display();

  // --- BLE Setup ---
  Serial.println("Starting BLE setup...");
  BLEDevice::init("RepCounterESP32");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Characteristic defined! Now advertising...");

  // --- Button Setup ---
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  updateAndPrintState();
}

void loop() {
  // Handle BLE connection state changes
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
      Serial.println("Device Connected");
      updateAndPrintState();
  }
  if (!deviceConnected && oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
      Serial.println("Device Disconnected");
      delay(500); 
      BLEDevice::startAdvertising();
      Serial.println("Restart advertising");
  }

  // --- Button Check ---
  int buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW) { // Button pressed
    unsigned long currentTime = millis();
    if (currentTime - lastButtonPress > debounceDelay) {
      // Cycle exercise mode
      currentExercise = static_cast<ExerciseMode>((currentExercise + 1) % 3);
      repCount = 0; // reset reps when changing exercise
      repState = RESTING;
      updateAndPrintState();
      Serial.println("Exercise changed!");
      lastButtonPress = currentTime;
    }
  }

  // --- Read MPU Data ---
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float angle = 0;
  if (currentExercise == LATERAL_RAISE) {
    angle = atan2(a.acceleration.y, a.acceleration.z) * 180 / PI;
    angle = abs(angle);
  } else {
    angle = atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 180 / PI;
    angle = map(angle, -90, 90, 0, 180);
  }

  // --- Rep Counting Logic ---
  countReps(angle);

  delay(50);
}

void countReps(float angle) {
  switch (currentExercise) {
    case BICEP_CURL: processRep(angle, BICEP_CURL_START_ANGLE, BICEP_CURL_END_ANGLE, true); break;
    case LATERAL_RAISE: processRep(angle, LATERAL_RAISE_START_ANGLE, LATERAL_RAISE_END_ANGLE, false); break;
    case SQUAT: processRep(angle, SQUAT_START_ANGLE, SQUAT_END_ANGLE, false); break;
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
        updateAndPrintState();
        repState = RESTING;
      }
      break;
  }
}
