#pass through CNN layers
#determine the kernel size and maxpooling
#pass through linear layers

import torch
import torch.nn as nn
import numpy as np
import random

# Set the seed for reproducibility
seed = 42
torch.manual_seed(seed)
np.random.seed(seed)
random.seed(seed)

class NN(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear1 = nn.Linear(52, 16) 
        self.linear2 = nn.Linear(16, 1)

        self.leaky_relu = nn.LeakyReLU()
        self.dropout = nn.Dropout(p=0.1)
    
    def forward(self, x):
        x = self.linear1(x)
        x = self.leaky_relu(x)
        x = self.dropout(x)
        x = self.linear2(x)
        return x