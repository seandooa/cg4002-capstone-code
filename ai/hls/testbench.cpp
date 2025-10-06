#include <cstdint>
#include <iostream>
#include <cstdlib>
#include <ctime>
#include "nn_inference.h"


#define INPUT_SIZE 52


int main() {
   float result;


   hls::stream<trans_pkt> in_stream;
   hls::stream<trans_pkt> out_stream;
   trans_pkt pkt;


   float test1[INPUT_SIZE] = {
       0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 4.4296e+02, 3.2923e+02, 9.8545e-01, 2.1446e+02, 3.2736e+02, 9.9370e-01, 5.4523e+02, 3.7812e+02, 7.8866e-01, 1.0471e+02, 3.5919e+02,
       8.9227e-01, 4.9889e+02, 3.3569e+02, 8.4393e-01, 7.3555e+01, 3.1993e+02, 9.0009e-01, 0.0000e+00, 0.0000e+00, 2.4619e-01, 0.0000e+00, 0.0000e+00, 3.1204e-01, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 2.0000e+00
   };


   float test2[INPUT_SIZE] = {
    0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 3.3144e+02, 2.1167e+02, 9.8806e-01, 3.5981e+02, 2.2527e+02, 7.5175e-01, 3.3696e+02, 3.0010e+02, 9.4866e-01, 0.0000e+00, 0.0000e+00,
       1.6018e-01, 3.1783e+02, 3.8232e+02, 9.0399e-01, 0.0000e+00, 0.0000e+00, 2.3569e-01, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00, 0.0000e+00
   };


   std::cout << std::fixed << std::setprecision(4);
   std::cout << "Test1: ";
   for (int i = 0; i < INPUT_SIZE; i++) {
       pkt.data = test1[i];
       pkt.last = (i == INPUT_SIZE - 1) ? 1 : 0;    // mark last element
       in_stream.write(pkt);
       std::cout << pkt.data << " ";
   }
   std::cout << std::endl;


   // Call DUT
   nn_inference(in_stream, out_stream);


   pkt = out_stream.read();
   result = pkt.data;
   // Print output
   std::cout << "NN Output: " << result << std::endl;


   std::cout << "Test2: ";
   for (int i = 0; i < INPUT_SIZE; i++) {
       pkt.data = test2[i];
       pkt.last = (i == INPUT_SIZE - 1) ? 1 : 0;    // mark last element
       in_stream.write(pkt);
       std::cout << pkt.data << " ";
   }
   std::cout << std::endl;


   // Call DUT
   nn_inference(in_stream, out_stream);


   pkt = out_stream.read();
   result = pkt.data;
   // Print output
   std::cout << "NN Output2: " << result << std::endl;
   return 0;
}
