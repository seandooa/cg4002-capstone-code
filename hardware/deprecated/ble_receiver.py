import asyncio
from bleak import BleakClient, BleakScanner
import matplotlib.pyplot as plt
from collections import deque
import json

SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
CHARACTERISTIC_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

# Real-time waveform buffer
waveform = deque(maxlen=512)

# Dashboard state
latest_bpm = 0
latest_spo2 = 0
latest_steps = 0

async def main():
    device = await BleakScanner.find_device_by_name("ESP32_MultiSensor")
    if not device:
        print("Device not found!")
        return
    
    async with BleakClient(device) as client:
        print("Connected!")

        def handle_notify(_, data: bytearray):
            global latest_bpm, latest_spo2, latest_steps

            try:
                msg = data.decode(errors="ignore").replace("\n","")
                info = json.loads(msg)

                # Update HR/SpO2/Steps
                latest_bpm = info.get("bpm", latest_bpm)
                latest_spo2 = info.get("spo2", latest_spo2)
                latest_steps = info.get("steps", latest_steps)

                # Update mic waveform
                for s in info.get("mic", []):
                    waveform.append(s)
            except Exception as e:
                print("Parse error:", e)

        await client.start_notify(CHARACTERISTIC_UUID, handle_notify)

        # ------------------ Setup plotting ------------------
        plt.ion()
        fig, (ax_wave, ax_stats) = plt.subplots(2, 1, figsize=(10, 6), gridspec_kw={'height_ratios':[3,1]})
        line_wave, = ax_wave.plot(list(waveform))
        ax_wave.set_title("Microphone Waveform")
        ax_wave.set_ylabel("Amplitude")
        ax_wave.set_xlabel("Samples")

        text_stats = ax_stats.text(0.05, 0.5, "", fontsize=14)
        ax_stats.axis('off')

        while True:
            # Update waveform plot
            line_wave.set_ydata(list(waveform))
            line_wave.set_xdata(range(len(waveform)))
            ax_wave.relim()
            ax_wave.autoscale_view()

            # Update stats
            stats_str = f"BPM: {latest_bpm}\nSpO2: {latest_spo2:.1f}%\nSteps: {latest_steps}"
            text_stats.set_text(stats_str)

            plt.pause(0.01)
            await asyncio.sleep(0.01)

if __name__ == "__main__":
    asyncio.run(main())
