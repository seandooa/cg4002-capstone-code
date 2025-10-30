#define BAT_ADC_PIN 34  // try 35 first, then 34 if always 0

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);  
  analogSetPinAttenuation(BAT_ADC_PIN, ADC_11db);
}

void loop() {
  int raw = analogRead(BAT_ADC_PIN);
  Serial.print("ADC raw = ");
  Serial.println(raw);
  delay(1000);
}
