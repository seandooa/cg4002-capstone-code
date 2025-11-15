import torch
import numpy as np
from ultralytics import YOLO
from torch.utils.data import DataLoader
import time

from models.NN import NN
from yolo_preprocessing import preprocessing

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BATCH_SIZE = 1
device = torch.device("cpu")
POSE_MODEL = "models/yolo11n-pose.pt"
pose_model = YOLO(POSE_MODEL)
NN_model = NN().to(device)
NN_model.load_state_dict(torch.load(f'models/model_epoch_74.pt', weights_only=True)) 
NN_model.eval()

def yolo_inference(imageList: list):
    poses = preprocessing(pose_model=pose_model, imageList=imageList)
    result = []
    
    with torch.inference_mode():
        for pose in poses:
            pose = torch.tensor(pose).to(torch.float32).to(device)
            logits = NN_model(pose)
            probabilities = torch.sigmoid(logits).item()
            print(probabilities)
    return result

if __name__ == "__main__":
    start = time.time()
    yolo_inference(["t1_1.jpg"])
    print(f'Inference time: {((time.time() - start) * 1000):.4f} ms')