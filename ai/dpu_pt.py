from pytorch_nndct.apis import torch_quantizer, dump_xmodel
from ultralytics import YOLO
import torch.nn as nn
import torch
import numpy as np
import cv2

IMAGE_SIZE = 640
target = "DPUCZDX8G_ISA1_B4096"
model = YOLO("yolo8n-pose.pt").model

def preprocess_image(imagePath):
    imagePath = f'images/{imagePath}'
    image = cv2.imread(imagePath)
    if image is None:
        raise FileNotFoundError(f"Image not found: {imagePath}")
    
    #resize image to be used by pose estimation model and normalise it
    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    normalized = resized.astype(np.float32) / 255.0
    return normalized.transpose(2, 0, 1)

class ModifiedYOLO(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, x):
        return self.model(x)

image = preprocess_image("data/e1_1.png")
dummy = torch.tensor(image, dtype=torch.float32).unsqueeze(0)
pose_model = ModifiedYOLO(model).eval()
print("calibrating...")
quantizer = torch_quantizer(quant_mode='calib', module=pose_model, input_args=(dummy), target=target)
quant_model = quantizer.quant_model
quantizer.export_quant_config()

print("quantizing...")
quantizer = torch_quantizer(quant_mode='test', module=pose_model, input_args=(dummy), target=target)
quantizer.export_torch_script()
quantizer.export_onnx_model()
quantizer.export_xmodel(deploy_check=False)