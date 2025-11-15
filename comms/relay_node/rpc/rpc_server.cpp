#include "rpc/server.h"

#include <arpa/inet.h> // For htons, INADDR_ANY
#include <array>
#include <cstring> // For memset
#include <iostream>
#include <mutex>
#include <netinet/in.h> // For sockaddr_in
#include <queue>
#include <sys/socket.h>
#include <sys/types.h>
#include <thread>
#include <unistd.h> // For close(), read(), write()

struct data_t {
  int mode = 0;
  int hr = 0;
  int reps = 0;
  bool start = false;
};

struct image_data_t {
  float data[59];
};

struct ai_feedback_t {
  bool has_value = false;
  bool flag = false;
};

std::mutex biometrics_data_mutex;
data_t biometrics_data;

std::mutex image_data_queue_mutex;
std::queue<image_data_t> image_data_queue;

std::mutex result_queue_mutex;
std::queue<bool> result_queue;

void rpc_server() {
  rpc::server srv(3000);

  srv.bind("img_qlen", []() {
    image_data_queue_mutex.lock();
    auto size = image_data_queue.size();
    image_data_queue_mutex.unlock();
    return size;
  });

  srv.bind("get_img_data", []() {
    image_data_queue_mutex.lock();
    auto front = image_data_queue.front();
    image_data_queue.pop();
    image_data_queue_mutex.unlock();
    std::array<char, sizeof(image_data_t)> raw_bytes;
    for (size_t i = 0; i < sizeof(image_data_t); i++) {
      auto *ptr = reinterpret_cast<char *>(&front);
      raw_bytes[i] = *(ptr + i);
    }
    return raw_bytes;
  });

  srv.bind("put_result", [](bool result) {
    result_queue_mutex.lock();
    result_queue.push(result);
    result_queue_mutex.unlock();
    std::cout << "PREDICTION=";
    if (result) {
      std::cout << "true";
    } else {
      std::cout << "false";
    }
    std::cout << "\n";
  });

  std::cout << "Starting RPC server on port 3000...\n";

  srv.run();
}

void esp_receive_server() {
  int port = 5555;

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    perror("socket");
    return;
  }

  // Allow reuse of address (helps avoid "address already in use" on restart)
  int opt = 1;
  if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
    perror("setsockopt");
    close(server_fd);
    return;
  }

  sockaddr_in serv_addr;
  memset(&serv_addr, 0, sizeof(serv_addr));
  serv_addr.sin_family = AF_INET;
  serv_addr.sin_addr.s_addr = INADDR_ANY; // accept connections on any interface
  serv_addr.sin_port = htons(port);

  if (bind(server_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
    perror("bind");
    close(server_fd);
    return;
  }

  if (listen(server_fd, 5) < 0) {
    perror("listen");
    close(server_fd);
    return;
  }

  std::cout << "Starting TCP server on port " << port << "...\n";

  while (true) {
    sockaddr_in cli_addr;
    socklen_t cli_len = sizeof(cli_addr);
    int client_fd = accept(server_fd, (struct sockaddr *)&cli_addr, &cli_len);
    if (client_fd < 0) {
      perror("accept");
      close(server_fd);
      return;
    }

    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &cli_addr.sin_addr, client_ip, sizeof(client_ip));
    // std::cout << "Accepted connection from " << client_ip << ", port " <<
    // ntohs(cli_addr.sin_port) << "\n";

    data_t packet;
    ssize_t bytes_read = read(client_fd, &packet, sizeof(data_t));
    if (bytes_read < 0) {
      perror("read");
    } else {
      biometrics_data_mutex.lock();
      biometrics_data = packet;
      if (biometrics_data.mode == 0) {
          image_data_queue_mutex.lock();
          while (image_data_queue.size() > 0) {
            image_data_queue.pop();
          }
          image_data_queue_mutex.unlock();
      }
      biometrics_data_mutex.unlock();
      if (packet.start) {
        std::cout << "mode: " << packet.mode << ", hr: " << packet.hr
                  << ", reps: " << packet.reps << ", start: true\n";
      } else {
        std::cout << "mode: " << packet.mode << ", hr: " << packet.hr
                  << ", reps: " << packet.reps << ", start: false\n";
      }
    }

    close(client_fd);
  }
}

void obs_receive_server() {
  int port = 5556;

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    perror("socket");
    return;
  }

  // Allow reuse of address (helps avoid "address already in use" on restart)
  int opt = 1;
  if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
    perror("setsockopt");
    close(server_fd);
    return;
  }

  sockaddr_in serv_addr;
  memset(&serv_addr, 0, sizeof(serv_addr));
  serv_addr.sin_family = AF_INET;
  serv_addr.sin_addr.s_addr = INADDR_ANY; // accept connections on any interface
  serv_addr.sin_port = htons(port);

  if (bind(server_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
    perror("bind");
    close(server_fd);
    return;
  }

  if (listen(server_fd, 5) < 0) {
    perror("listen");
    close(server_fd);
    return;
  }

  std::cout << "Starting TCP server on port " << port << "...\n";

  while (true) {
    sockaddr_in cli_addr;
    socklen_t cli_len = sizeof(cli_addr);
    int client_fd = accept(server_fd, (struct sockaddr *)&cli_addr, &cli_len);
    if (client_fd < 0) {
      perror("accept");
      close(server_fd);
      return;
    }

    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &cli_addr.sin_addr, client_ip, sizeof(client_ip));
    // std::cout << "Accepted connection from " << client_ip << ", port " <<
    // ntohs(cli_addr.sin_port) << "\n";

    image_data_t packet;
    ssize_t bytes_read = read(client_fd, &packet, sizeof(image_data_t));
    if (bytes_read < 0) {
      perror("read");
    } else {
      image_data_queue_mutex.lock();
      image_data_queue.push(packet);
      image_data_queue_mutex.unlock();
      /*
      std::cout << "\nRECEIVED IMAGE DATA PACKET\n";
      for (int i = 0; i < 59; i++) {
        std::cout << packet.data[i];
        if (i < 58) {
          std::cout << ", ";
        }
      }
      std::cout << "\n";
        */
    }

    close(client_fd);
  }
}

void visualizer_biometrics_server() {
  int port = 5557;

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    perror("socket");
    return;
  }

  // Allow reuse of address (helps avoid "address already in use" on restart)
  int opt = 1;
  if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
    perror("setsockopt");
    close(server_fd);
    return;
  }

  sockaddr_in serv_addr;
  memset(&serv_addr, 0, sizeof(serv_addr));
  serv_addr.sin_family = AF_INET;
  serv_addr.sin_addr.s_addr = INADDR_ANY; // accept connections on any interface
  serv_addr.sin_port = htons(port);

  if (bind(server_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
    perror("bind");
    close(server_fd);
    return;
  }

  if (listen(server_fd, 5) < 0) {
    perror("listen");
    close(server_fd);
    return;
  }

  std::cout << "Starting TCP server on port " << port << "...\n";

  while (true) {
    sockaddr_in cli_addr;
    socklen_t cli_len = sizeof(cli_addr);
    int client_fd = accept(server_fd, (struct sockaddr *)&cli_addr, &cli_len);
    if (client_fd < 0) {
      perror("accept");
      close(server_fd);
      return;
    }

    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &cli_addr.sin_addr, client_ip, sizeof(client_ip));

    size_t msg_len = sizeof(biometrics_data);

    biometrics_data_mutex.lock();
    ssize_t sent = send(client_fd, &biometrics_data, msg_len, 0);
    biometrics_data_mutex.unlock();
    if (sent < 0) {
      std::cerr << "send() failed: " << strerror(errno) << "\n";
    }

    close(client_fd);
  }
}

void visualizer_ai_feedback_server() {
  int port = 5558;

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    perror("socket");
    return;
  }

  // Allow reuse of address (helps avoid "address already in use" on restart)
  int opt = 1;
  if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
    perror("setsockopt");
    close(server_fd);
    return;
  }

  sockaddr_in serv_addr;
  memset(&serv_addr, 0, sizeof(serv_addr));
  serv_addr.sin_family = AF_INET;
  serv_addr.sin_addr.s_addr = INADDR_ANY; // accept connections on any interface
  serv_addr.sin_port = htons(port);

  if (bind(server_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
    perror("bind");
    close(server_fd);
    return;
  }

  if (listen(server_fd, 5) < 0) {
    perror("listen");
    close(server_fd);
    return;
  }

  std::cout << "Starting TCP server on port " << port << "...\n";

  while (true) {
    sockaddr_in cli_addr;
    socklen_t cli_len = sizeof(cli_addr);
    int client_fd = accept(server_fd, (struct sockaddr *)&cli_addr, &cli_len);
    if (client_fd < 0) {
      perror("accept");
      close(server_fd);
      return;
    }

    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &cli_addr.sin_addr, client_ip, sizeof(client_ip));

    ai_feedback_t result_struct{};
    result_queue_mutex.lock();
    if (result_queue.size() > 0) {
      auto result = result_queue.front();
      result_queue.pop();
      result_struct.has_value = true;
      result_struct.flag = result;
    } else {
      result_struct.has_value = false;
    }
    result_queue_mutex.unlock();
    size_t msg_len = sizeof(result_struct);
    ssize_t sent = send(client_fd, &result_struct, msg_len, 0);
    if (sent < 0) {
      std::cerr << "send() failed: " << strerror(errno) << "\n";
    }

    close(client_fd);
  }
}

int main() {
  std::thread t1(rpc_server);
  std::thread t2(esp_receive_server);
  std::thread t3(obs_receive_server);
  std::thread t4(visualizer_biometrics_server);
  std::thread t5(visualizer_ai_feedback_server);
  for (;;) {
  }
}
