#pragma once

#include <windows.h>
#include <winioctl.h>
#include <iphlpapi.h>
#include <intrin.h>
#include <string>
#include <vector>
#include <algorithm>
#include <mutex>

#pragma comment(lib, "iphlpapi.lib")

namespace HwidCollect {

inline std::string trim(std::string s) {
    s.erase(0, s.find_first_not_of(" \t\r\n\""));
    if (!s.empty()) s.erase(s.find_last_not_of(" \t\r\n\"") + 1);
    return s;
}

inline bool badValue(const std::string& s) {
  if (s.empty()) return true;
  std::string l = s;
  std::transform(l.begin(), l.end(), l.begin(), ::tolower);
  if (l.find("error") != std::string::npos || l.find("cancelled") != std::string::npos) return true;
  if (l == "unavailable" || l == "unknown" || l == "unknown_hwid") return true;
  if (l.find("to be filled") != std::string::npos) return true;
  if (l.find("o.e.m") != std::string::npos) return true;
  if (l.find("default string") != std::string::npos) return true;
  if (l.find("system serial") != std::string::npos) return true;
  if (l == "none" || l == "n/a" || l == "na") return true;
  return false;
}

inline std::string regRead(HKEY root, const char* subkey, const char* valueName) {
    HKEY hKey = nullptr;
    if (RegOpenKeyExA(root, subkey, 0, KEY_READ | KEY_WOW64_64KEY, &hKey) != ERROR_SUCCESS)
        return "";
    char buf[512] = {};
    DWORD size = sizeof(buf) - 1;
    DWORD type = 0;
    const LONG res = RegQueryValueExA(hKey, valueName, nullptr, &type, (LPBYTE)buf, &size);
    RegCloseKey(hKey);
    return (res == ERROR_SUCCESS) ? trim(std::string(buf)) : "";
}

struct DmiHeader {
    BYTE type;
    BYTE length;
    WORD handle;
};

inline const char* dmiString(const DmiHeader* dm, BYTE index) {
    if (index == 0) return "";
    const char* str = (const char*)dm + dm->length;
    while (index > 1 && *str) {
        str += strlen(str) + 1;
        index--;
    }
    return str;
}

struct SmbiosCache {
    std::string sysManufacturer;
    std::string sysProduct;
    std::string sysSerial;
    std::string sysUuid;
    std::string boardManufacturer;
    std::string boardProduct;
    std::string boardSerial;
    std::string chassisSerial;
    std::string cpuName;
    bool parsed = false;
};

inline SmbiosCache smbios(bool forceRefresh = false) {
    static std::mutex cacheMutex;
    std::lock_guard<std::mutex> lock(cacheMutex);
    static SmbiosCache cache;
    if (forceRefresh)
        cache = {};
    if (cache.parsed) return cache;

    const DWORD sig = 'RSMB';
    const DWORD size = GetSystemFirmwareTable(sig, 0, nullptr, 0);
    if (size > 0) {
        std::vector<BYTE> buf(size);
        if (GetSystemFirmwareTable(sig, 0, buf.data(), size) == size && size > 8) {
            const BYTE* p = buf.data() + 8;
            const BYTE* end = buf.data() + size;
            while (p + sizeof(DmiHeader) <= end) {
                const DmiHeader* h = (const DmiHeader*)p;
                if (h->length < 4 || p + h->length > end) break;
                if (h->type == 1 && h->length >= 0x19) {
                    cache.sysManufacturer = dmiString(h, p[0x04]);
                    cache.sysProduct = dmiString(h, p[0x05]);
                    cache.sysSerial = dmiString(h, p[0x07]);
                    const BYTE* u = p + 0x08;
                    char uuidBuf[64];
                    snprintf(uuidBuf, sizeof(uuidBuf),
                        "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
                        u[3], u[2], u[1], u[0], u[5], u[4], u[7], u[6],
                        u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15]);
                    cache.sysUuid = uuidBuf;
                } else if (h->type == 2 && h->length >= 0x08) {
                    cache.boardManufacturer = dmiString(h, p[0x04]);
                    cache.boardProduct = dmiString(h, p[0x05]);
                    cache.boardSerial = dmiString(h, p[0x07]);
                } else if (h->type == 3 && h->length >= 0x07) {
                    cache.chassisSerial = dmiString(h, p[0x06]);
                } else if (h->type == 4 && h->length >= 0x11) {
                    cache.cpuName = dmiString(h, p[0x10]);
                } else if (h->type == 127) {
                    break;
                }
                p += h->length;
                while (p + 1 < end && (*p != 0 || *(p + 1) != 0)) p++;
                p += 2;
            }
        }
    }

    cache.parsed = true;
    return cache;
}

inline void invalidateSmbiosCache() {
    smbios(true);
}

inline std::string cpuBrand() {
    int cpuInfo[4] = {};
    char brand[0x40] = {};
    __cpuid(cpuInfo, 0x80000000);
    const unsigned maxExt = (unsigned)cpuInfo[0];
    if (maxExt >= 0x80000004) {
        __cpuid((int*)brand, 0x80000002);
        __cpuid((int*)(brand + 16), 0x80000003);
        __cpuid((int*)(brand + 32), 0x80000004);
        return trim(std::string(brand));
    }
    return "";
}

inline std::string cpuSerial() {
    int cpuInfo[4] = {};
    __cpuid(cpuInfo, 1);
    char buf[32];
    snprintf(buf, sizeof(buf), "%08X%08X", cpuInfo[3], cpuInfo[0]);
    return buf;
}

inline std::string macAddress() {
    ULONG bufLen = 0;
    if (GetAdaptersInfo(nullptr, &bufLen) != ERROR_BUFFER_OVERFLOW || !bufLen) return "";
    std::vector<BYTE> buffer(bufLen);
    if (GetAdaptersInfo((IP_ADAPTER_INFO*)buffer.data(), &bufLen) != NO_ERROR) return "";
    for (IP_ADAPTER_INFO* p = (IP_ADAPTER_INFO*)buffer.data(); p; p = p->Next) {
        if (p->AddressLength != 6) continue;
        char macBuf[32];
        snprintf(macBuf, sizeof(macBuf), "%02X:%02X:%02X:%02X:%02X:%02X",
            p->Address[0], p->Address[1], p->Address[2],
            p->Address[3], p->Address[4], p->Address[5]);
        return macBuf;
    }
    return "";
}

inline std::string diskSerials() {
    std::vector<std::string> serials;
    for (int drive = 0; drive < 32; drive++) {
        const std::string path = "\\\\.\\PhysicalDrive" + std::to_string(drive);
        HANDLE h = CreateFileA(path.c_str(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE,
            nullptr, OPEN_EXISTING, 0, nullptr);
        if (h == INVALID_HANDLE_VALUE) continue;
        STORAGE_PROPERTY_QUERY query{};
        query.PropertyId = StorageDeviceProperty;
        query.QueryType = PropertyStandardQuery;
        BYTE buffer[1024] = {};
        DWORD bytesReturned = 0;
        if (DeviceIoControl(h, IOCTL_STORAGE_QUERY_PROPERTY, &query, sizeof(query),
            buffer, sizeof(buffer), &bytesReturned, nullptr)) {
            const STORAGE_DEVICE_DESCRIPTOR* desc = (const STORAGE_DEVICE_DESCRIPTOR*)buffer;
            if (desc->SerialNumberOffset && desc->SerialNumberOffset < bytesReturned) {
                const std::string s = trim((const char*)buffer + desc->SerialNumberOffset);
                if (!badValue(s)) serials.push_back(s);
            }
        }
        CloseHandle(h);
    }
    std::sort(serials.begin(), serials.end());
    std::string out;
    for (const auto& s : serials) { out += s; out.push_back(';'); }
    return out;
}

inline std::string gpuNames() {
    DISPLAY_DEVICEA dd{};
    dd.cb = sizeof(dd);
    std::string out;
    for (DWORD i = 0; EnumDisplayDevicesA(nullptr, i, &dd, 0); i++) {
        if (dd.StateFlags & DISPLAY_DEVICE_MIRRORING_DRIVER) continue;
        const std::string name = trim(std::string(dd.DeviceString));
        if (badValue(name)) continue;
        out += name;
        out.push_back(';');
    }
    return out;
}

// Hardware-only fingerprint for license binding. Never reads the registry.
// GPU is collected for display/diagnostics only — excluded here because driver-less
// installs (e.g. after format) would change the hash without hardware changing.
// Field order and sources must stay stable across login, rebind, and heartbeat.
inline std::string buildAuthFingerprint(bool forceRefresh = false) {
    std::string raw;
    auto add = [&](const char* tag, const std::string& value) {
        if (badValue(value)) return;
        raw += tag;
        raw += value;
        raw.push_back('\n');
    };

    add("cpusn", cpuSerial());
    add("cbrand", cpuBrand());

    const SmbiosCache& c = smbios(forceRefresh);
    add("cpu", c.cpuName);
    add("sysm", c.sysManufacturer);
    add("sysp", c.sysProduct);
    add("sys", c.sysSerial);
    add("uuid", c.sysUuid);
    add("bm", c.boardManufacturer);
    add("bp", c.boardProduct);
    add("brd", c.boardSerial);
    add("ch", c.chassisSerial);
    add("mac", macAddress());
    add("disk", diskSerials());

    return raw;
}

inline std::string buildFingerprint() {
    std::string raw;
    auto add = [&](const char* tag, const std::string& value) {
        if (badValue(value)) return;
        raw += tag;
        raw += value;
        raw.push_back('\n');
    };

    add("mg", regRead(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", "MachineGuid"));
    add("pid", regRead(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "ProductId"));

    DWORD volSerial = 0;
    if (GetVolumeInformationA("C:\\", nullptr, 0, &volSerial, nullptr, nullptr, nullptr, 0))
        add("vol", std::to_string(volSerial));

    add("cbrand", cpuBrand());
    add("cpusn", cpuSerial());

    const SmbiosCache& c = smbios();
    add("uuid", c.sysUuid);
    add("sys", c.sysSerial);
    add("sysm", c.sysManufacturer);
    add("sysp", c.sysProduct);
    add("brd", c.boardSerial);
    add("bm", c.boardManufacturer);
    add("bp", c.boardProduct);
    add("ch", c.chassisSerial);
    add("cpu", c.cpuName);
    add("bios", regRead(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BIOSSerialNumber"));
    add("mac", macAddress());
    add("disk", diskSerials());
    add("gpu", gpuNames());

    return raw;
}

} // namespace HwidCollect
