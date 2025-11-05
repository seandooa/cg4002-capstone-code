#pass through CNN layers
#determine the kernel size and maxpooling
#pass through linear layers

import torch
import torch.optim as optim
import os
import torch.nn as nn
import numpy as np
from ultralytics import YOLO
from torch.utils.data import DataLoader

from preprocessingv2 import preprocessing
from nn_models.NN import NN

'''
bicep curls: tucked in and perpendicular elbows, + no leaning
squats: 90 degrees, knees shoulder width apart + little bit of allowance, dont lean forward / tiptoe,
lateral raises:  
'''

BATCH_SIZE = 1
EPOCH_FOLDER_DIR = "epochs"
EPOCH_FILEPATH = f'models/model_epoch_74.pt' #74 - 11

def inference(inference_dataloader: DataLoader, epoch_folder_path: str, epoch_filepath: str):
    device = torch.device("mps" if torch.backends.mps.is_available() and torch.backends.mps.is_built() else "cpu")
    
    NN_model = NN().to(device)
    if (epoch_filepath):
        NN_model.load_state_dict(torch.load(f'{epoch_filepath}', weights_only=True)) 
    NN_model.eval()

    total = 0
    correct= 0
    with torch.inference_mode():
        for poseData, labels in inference_dataloader:
            poseData = poseData.to(torch.float32).to(device)
            labels = labels.to(torch.float32).to(device).item()

            logits = NN_model(poseData)
            probabilities = torch.sigmoid(logits).item()
            if ((probabilities > 0.5 and labels == 1.0) or (probabilities < 0.5 and labels == 0.0)):
                correct += 1
            total += 1
    print(f'{correct} / {total}')
    
if __name__ == "__main__":
    
    #data preprocessing
    print("\n>>> Processing and loading data ...")
    inference_dataloader, _ = preprocessing(csv_filePath="test.csv", batch_size=BATCH_SIZE, isTraining=False)

    #actual training loop
    inference(inference_dataloader=inference_dataloader, epoch_folder_path=EPOCH_FOLDER_DIR, epoch_filepath=EPOCH_FILEPATH)