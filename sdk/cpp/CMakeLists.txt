cmake_minimum_required(VERSION 3.10)
project(RakhaAuthQuickstart LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "RakhaAuth C++ SDK currently supports Windows only")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(rakha_quickstart quickstart.cpp)
target_link_libraries(rakha_quickstart PRIVATE
  winhttp
  bcrypt
  crypt32
  dnsapi
  wevtapi
  iphlpapi
  user32
  advapi32
)
