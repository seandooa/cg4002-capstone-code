import torch
import time
import struct
import socket
import cv2
import numpy as np
from ultralytics import YOLO
from NN import NN
from preprocessingv2 import preprocessing_rt

# ==== CONFIG ====
DEVICE = torch.device("cpu")
POSE_MODEL_PATH = "models/yolo11s-pose.pt"
NN_MODEL_PATH = "model_epoch_74.pt"
EXERCISE = 0 # 0=bicep curls, 1=squats, 2=lateral raise

# ==== LOAD MODELS ====
pose_model = YOLO(POSE_MODEL_PATH)
NN_model = NN().to(DEVICE)
NN_model.load_state_dict(torch.load(NN_MODEL_PATH, weights_only=True))
NN_model.eval()

# ==== REAL-TIME LOOP ====
cap = cv2.VideoCapture(1, cv2.CAP_AVFOUNDATION)  # 0 for webcam, or replace with video file path

if not cap.isOpened():
    print("❌ Cannot open camera or video")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("Stream ended or failed.")
        break

    # Run preprocessing and skip if no detection

    fmt = "<i i i b"
    size = struct.calcsize(fmt)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("127.0.0.1", 5557))
    buffer = s.recv(size)
    s.close()
    values = struct.unpack(fmt, buffer)
    exercise = values[0]
    exercise_code = -1
    if exercise == 2:
        exercise_code = 2
    elif exercise == 3:
        exercise_code = 1
    elif exercise == 4:
        exercise_code = 0
    if exercise_code == -1:
        continue

    pose_data = preprocessing_rt(frame, exercise_code)
    if pose_data is None:
        # no detection — just show frame
        cv2.imshow("Real-Time Feed", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
        continue

    # Run NN inference (you can comment this out if not needed)
    with torch.inference_mode():
        pose_tensor = torch.tensor(pose_data, dtype=torch.float32).to(DEVICE)
        
        print(pose_tensor)
        raw_array = np.array(pose_tensor).tolist()
        fmt = '<' + ('f' * 59)
        packed = struct.pack(fmt, *raw_array)
        print("\n")
        print(raw_array)
        print("\n")
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", 5556))
        s.send(packed)

        time.sleep(0.5)

    # Just show the live frame (no overlay)
    cv2.imshow("Real-Time Feed", frame)

    # press 'q' to quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
