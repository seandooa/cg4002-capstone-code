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
NN_model = NN().to(device)
NN_model.load_state_dict(torch.load(f'models/model_epoch_74.pt', weights_only=True)) 
NN_model.eval()

def yolo_inference(imageList: list):
    inference_dataloader = preprocessing(imageList=imageList, batchSize=BATCH_SIZE)
    result = []
    
    with torch.inference_mode():
        for pose in inference_dataloader:
            pose = pose.to(torch.float32).to(device)
            logits = NN_model(pose)
            probabilities = torch.sigmoid(logits).item()
            print(probabilities)
    return result

if __name__ == "__main__":
    start = time.time()
    yolo_inference(["e1_1.png", "e3_2.png", "e3_1.png"])
    print(f'Inference time: {((time.time() - start) * 1000):.4f} ms')