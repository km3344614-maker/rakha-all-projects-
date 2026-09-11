#pragma once

#include <windows.h>
#include <winhttp.h>
#include <windns.h>
#include <winevt.h>
#include <string>
#include <vector>
#include <algorithm>
#include <atomic>
#include <thread>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <cstddef>
#include <cstdlib>
#include <cctype>
#include <wincrypt.h>
#include "skStr.h"
#include "protect_markers.h"
#include "doh.h"

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "dnsapi.lib")
#pragma comment(lib, "wevtapi.lib")
#pragma comment(lib, "crypt32.lib")

#ifndef SECURITY_FLAG_IGNORE_CERT_DATE_INVALID
#define SECURITY_FLAG_IGNORE_CERT_DATE_INVALID 0x00002000
#endif
#ifndef WINHTTP_QUERY_FLAG_SYSTEMTIME
#define WINHTTP_QUERY_FLAG_SYSTEMTIME 0x20000000
#endif

#ifndef XOR
#define XOR(s) skCrypt(s).decrypt()
#endif

namespace RakhaInternal {

    // Network / auth-server skew budget (seconds).
    constexpr long long kTimeToleranceSec = 45;
    // Local wall clock vs tick drift — keep tight to catch manual edits.
    constexpr long long kLocalDriftSec    = 5;
    constexpr long long kMinUnixSane      = 1700000000LL; // 2023-11-14

    inline std::atomic<long long>& trustedOffsetSec() {
        static std::atomic<long long> off{0};
        return off;
    }

    inline long long unixNow() {
        FILETIME ft = {};
        GetSystemTimeAsFileTime(&ft);
        ULARGE_INTEGER u;
        u.LowPart = ft.dwLowDateTime;
        u.HighPart = ft.dwHighDateTime;
        if (u.QuadPart < 116444736000000000ULL) return 0;
        return (long long)((u.QuadPart - 116444736000000000ULL) / 10000000ULL);
    }

    // Local wall clock (with timezone applied) to catch timezone alteration
    inline long long localUnixNow() {
        SYSTEMTIME st = {};
        GetLocalTime(&st);
        FILETIME ft = {};
        if (!SystemTimeToFileTime(&st, &ft)) return unixNow();
        ULARGE_INTEGER u;
        u.LowPart = ft.dwLowDateTime;
        u.HighPart = ft.dwHighDateTime;
        if (u.QuadPart < 116444736000000000ULL) return unixNow();
        return (long long)((u.QuadPart - 116444736000000000ULL) / 10000000ULL);
    }

    inline std::atomic<LONG>& initialTzBias() {
        static std::atomic<LONG> b{0x7FFFFFFF};
        return b;
    }
    inline WCHAR* initialTzKey() {
        static WCHAR k[128] = {0};
        return k;
    }
    inline void captureInitialTz() {
        DYNAMIC_TIME_ZONE_INFORMATION dtzi = {};
        DWORD r = GetDynamicTimeZoneInformation(&dtzi);
        if (r != TIME_ZONE_ID_INVALID) {
            initialTzBias().store((LONG)dtzi.Bias, std::memory_order_relaxed);
            if (initialTzKey()[0] == 0) {
                wcsncpy_s(initialTzKey(), 128, dtzi.TimeZoneKeyName, _TRUNCATE);
            }
        }
    }
    inline bool assertTzIntegrity() {
        const LONG initB = initialTzBias().load(std::memory_order_relaxed);
        if (initB == 0x7FFFFFFF) return true;
        DYNAMIC_TIME_ZONE_INFORMATION dtzi = {};
        DWORD r = GetDynamicTimeZoneInformation(&dtzi);
        if (r == TIME_ZONE_ID_INVALID) return true;
        if ((LONG)dtzi.Bias != initB) return false;
        if (initialTzKey()[0] != 0 && wcsncmp(initialTzKey(), dtzi.TimeZoneKeyName, 128) != 0) return false;
        return true;
    }

    inline long long monoMs() {
        return (long long)GetTickCount64();
    }

    inline std::atomic<long long>& wallAnchorUnix() {
        static std::atomic<long long> v{0};
        return v;
    }
    inline std::atomic<long long>& localWallAnchorUnix() {
        static std::atomic<long long> v{0};
        return v;
    }
    inline std::atomic<long long>& wallAnchorMonoMs() {
        static std::atomic<long long> v{0};
        return v;
    }
    inline std::atomic<long long>& remoteAnchorUnix() {
        static std::atomic<long long> v{0};
        return v;
    }
    inline std::atomic<long long>& remoteAnchorMonoMs() {
        static std::atomic<long long> v{0};
        return v;
    }

    // Constant-initialized; safe from the TLS callback (before C++ constructors).
    inline LONG64 g_processStartUnix = 0;
    inline LONG64 g_processStartTick = 0;

    inline void startContinuousClockWatchdog();

    inline void captureProcessStartClock() {
        FILETIME ft = {};
        GetSystemTimeAsFileTime(&ft);
        ULARGE_INTEGER u;
        u.LowPart = ft.dwLowDateTime;
        u.HighPart = ft.dwHighDateTime;
        if (u.QuadPart >= 116444736000000000ULL) {
            const LONG64 now = (LONG64)((u.QuadPart - 116444736000000000ULL) / 10000000ULL);
            InterlockedCompareExchange64(&g_processStartUnix, now, 0);
            if (wallAnchorUnix().load(std::memory_order_relaxed) < kMinUnixSane) {
                wallAnchorUnix().store((long long)now, std::memory_order_relaxed);
                localWallAnchorUnix().store(localUnixNow(), std::memory_order_relaxed);
                wallAnchorMonoMs().store((long long)GetTickCount64(), std::memory_order_relaxed);
            }
        }
        InterlockedCompareExchange64(&g_processStartTick, (LONG64)GetTickCount64(), 0);
    }

    inline long long frozenLocalUnix() {
        const LONG64 v = g_processStartUnix;
        if (v > 0) return (long long)v;
        return unixNow();
    }

    inline long long tickElapsedSec(long long startMs) {
        const long long now = monoMs();
        if (now < startMs) return 0;
        return (now - startMs) / 1000;
    }

    inline long long llAbs(long long v) { return v < 0 ? -v : v; }

    inline void storeLastSeenUnix(long long u);
    inline void storeLastClockEventId(long long id);
    inline void storeClockTamperLatch(bool on);
    inline bool recentLoggedTimeChange(long long& maxIdOut);
    inline bool queryTrustedUtc(long long& remoteOut, long long& localOut, bool useProcessStartLocal = false, bool skipCache = false);
    inline void requestClockReverify();

    // Advances with GetTickCount64, not the Windows wall clock.
    inline long long trustedUnixNow() {
        const long long remote = remoteAnchorUnix().load(std::memory_order_relaxed);
        const long long remoteMono = remoteAnchorMonoMs().load(std::memory_order_relaxed);
        if (remote >= kMinUnixSane && remoteMono > 0)
            return remote + tickElapsedSec(remoteMono);

        const long long wall = wallAnchorUnix().load(std::memory_order_relaxed);
        const long long wallMono = wallAnchorMonoMs().load(std::memory_order_relaxed);
        if (wall >= kMinUnixSane && wallMono > 0)
            return wall + tickElapsedSec(wallMono);

        return unixNow();
    }

    inline bool wallAgreesWithTrusted(long long wall) {
        const long long trusted = trustedUnixNow();
        if (trusted < kMinUnixSane) return false;
        return llAbs(wall - trusted) <= kTimeToleranceSec;
    }

    inline void reanchorWallNow() {
        const long long wall = unixNow();
        const long long local = localUnixNow();
        const long long ticks = monoMs();
        wallAnchorUnix().store(wall, std::memory_order_relaxed);
        localWallAnchorUnix().store(local, std::memory_order_relaxed);
        wallAnchorMonoMs().store(ticks, std::memory_order_relaxed);
        captureInitialTz();
        storeLastSeenUnix(wall);
    }

    inline void ackClockEvents() {
        long long maxId = 0;
        recentLoggedTimeChange(maxId);
        if (maxId > 0)
            storeLastClockEventId(maxId);
    }

    inline void killThisProcess(UINT code) {
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
        HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
        if (ntdll) {
            typedef LONG(NTAPI* NtTerminateProcessFn)(HANDLE, LONG);
            auto ntTerm = (NtTerminateProcessFn)GetProcAddress(ntdll, "NtTerminateProcess");
            if (ntTerm) ntTerm(GetCurrentProcess(), (LONG)code);
        }
        TerminateProcess(GetCurrentProcess(), code);
        ExitProcess(code);
    }

    inline BOOL CALLBACK hideProcessWindows(HWND w, LPARAM pid) {
        DWORD p = 0;
        GetWindowThreadProcessId(w, &p);
        if (p == (DWORD)pid) {
            ShowWindow(w, SW_HIDE);
            EnableWindow(w, FALSE);
        }
        return TRUE;
    }

    inline void hardAbort() {
        MUTATE_START;
        killThisProcess(0);
        MUTATE_END;
    }

    inline void abortClockTamper() {
        static volatile LONG once = 0;
        if (InterlockedExchange(&once, 1) != 0) {
            return;
        }
        storeClockTamperLatch(true);
        EnumWindows(hideProcessWindows, (LPARAM)GetCurrentProcessId());
        MessageBoxW(
            nullptr,
            XOR(L"System clock manipulation detected.\nPlease synchronize your system clock and try again."),
            XOR(L"Application Security Alert"),
            MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND | MB_TASKMODAL);
        killThisProcess(1);
    }

    inline void alertNoInternet() {
        EnumWindows(hideProcessWindows, (LPARAM)GetCurrentProcessId());
        MessageBoxW(
            nullptr,
            XOR(L"No internet connection.\nConnect to the internet and try again."),
            XOR(L"Application"),
            MB_OK | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND | MB_SYSTEMMODAL);
    }

    inline void abortUnboundApp() {
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
        TerminateProcess(GetCurrentProcess(), 0);
        ExitProcess(0);
    }

    inline bool isUnboundAppHttp(int status, const std::string& body) {
        if (status == 403 || status == 404) return true;
        if (status != 401) return false;
        return body.find(XOR("Invalid credentials").c_str()) != std::string::npos
            || body.find(XOR("Service unavailable").c_str()) != std::string::npos;
    }

    struct TrustedSample {
        long long remoteUnix = 0;
        long long localMid   = 0;
        bool ok() const { return remoteUnix >= kMinUnixSane; }
        long long skew() const {
            long long s = localMid - remoteUnix;
            return s < 0 ? -s : s;
        }
    };

    inline long long fileTimeToUnix(const FILETIME& ft) {
        ULARGE_INTEGER u;
        u.LowPart  = ft.dwLowDateTime;
        u.HighPart = ft.dwHighDateTime;
        if (u.QuadPart < 116444736000000000ULL) return 0;
        return (long long)((u.QuadPart - 116444736000000000ULL) / 10000000ULL);
    }

    inline long long systemTimeToUnix(const SYSTEMTIME& st) {
        FILETIME ft = {};
        if (!SystemTimeToFileTime(&st, &ft)) return 0;
        return fileTimeToUnix(ft);
    }

    inline int monthIndex3(const char* p) {
        if (!p || !p[0] || !p[1] || !p[2]) return 0;
        auto eq = [](const char* a, const char* b) {
            return ((a[0] | 32) == b[0]) && ((a[1] | 32) == b[1]) && ((a[2] | 32) == b[2]);
        };
        if (eq(p, "jan")) return 1;
        if (eq(p, "feb")) return 2;
        if (eq(p, "mar")) return 3;
        if (eq(p, "apr")) return 4;
        if (eq(p, "may")) return 5;
        if (eq(p, "jun")) return 6;
        if (eq(p, "jul")) return 7;
        if (eq(p, "aug")) return 8;
        if (eq(p, "sep")) return 9;
        if (eq(p, "oct")) return 10;
        if (eq(p, "nov")) return 11;
        if (eq(p, "dec")) return 12;
        return 0;
    }

    // UTC civil time -> unix. No Windows TZ/local-time APIs (those can echo the fake clock).
    inline long long civilToUnixUtc(int y, int m, int d, int hh, int mm, int ss) {
        if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return 0;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 60) return 0;
        y -= (m <= 2);
        const int era = (y >= 0 ? y : y - 399) / 400;
        const unsigned yoe = (unsigned)(y - era * 400);
        const unsigned doy = (153u * (unsigned)(m + (m > 2 ? -3 : 9)) + 2u) / 5u + (unsigned)d - 1u;
        const unsigned doe = yoe * 365u + yoe / 4u - yoe / 100u + doy;
        const long long days = (long long)era * 146097LL + (long long)doe - 719468LL;
        return days * 86400LL + (long long)hh * 3600LL + (long long)mm * 60LL + (long long)ss;
    }

    inline long long parseRfc1123Unix(const char* s) {
        if (!s || !s[0]) return 0;
        const int len = (int)strlen(s);
        for (int i = 0; i + 12 < len; i++) {
            const int mo = monthIndex3(s + i);
            if (!mo) continue;
            int j = i - 1;
            while (j >= 0 && (s[j] == ' ' || s[j] == ',' || s[j] == '-')) j--;
            if (j < 0 || !isdigit((unsigned char)s[j])) continue;
            int day = 0, scale = 1;
            while (j >= 0 && isdigit((unsigned char)s[j])) {
                day += (s[j] - '0') * scale;
                scale *= 10;
                j--;
            }
            const char* rest = s + i + 3;
            while (*rest == ' ' || *rest == '-') rest++;
            int year = 0;
            if (!isdigit((unsigned char)*rest)) continue;
            while (isdigit((unsigned char)*rest)) {
                year = year * 10 + (*rest - '0');
                rest++;
            }
            if (year < 100) year += 2000;
            while (*rest == ' ') rest++;
            if (!isdigit((unsigned char)*rest)) continue;
            int hh = 0, mm = 0, ss = 0;
            while (isdigit((unsigned char)*rest)) { hh = hh * 10 + (*rest - '0'); rest++; }
            if (*rest != ':') continue;
            rest++;
            while (isdigit((unsigned char)*rest)) { mm = mm * 10 + (*rest - '0'); rest++; }
            if (*rest == ':') {
                rest++;
                while (isdigit((unsigned char)*rest)) { ss = ss * 10 + (*rest - '0'); rest++; }
            }
            const long long u = civilToUnixUtc(year, mo, day, hh, mm, ss);
            if (u >= kMinUnixSane) return u;
        }
        return 0;
    }

    inline long long parseHttpDateUnix(const wchar_t* date) {
        if (!date || !date[0]) return 0;
        char buf[128] = {};
        for (int i = 0; i < 127 && date[i]; i++) {
            if (date[i] > 127) return 0;
            buf[i] = (char)date[i];
        }
        return parseRfc1123Unix(buf);
    }

    inline long long parseCfTraceTs(const std::string& body) {
        const std::string key = XOR("ts=");
        size_t pos = body.find(key);
        if (pos == std::string::npos) return 0;
        pos += key.size();
        size_t end = pos;
        while (end < body.size() && (isdigit((unsigned char)body[end]) || body[end] == '.'))
            end++;
        if (end == pos) return 0;
        try {
            double d = std::stod(body.substr(pos, end - pos));
            return (long long)d;
        } catch (...) { return 0; }
    }

    // HEAD/GET against a neutral host. Remote UTC comes from the Date header
    // (HTTP) or from Cloudflare's NTP-backed `ts=` field when present.
    inline TrustedSample httpTrustedSample(
        const wchar_t* host, INTERNET_PORT port, const wchar_t* path, bool parseTrace)
    {
        TrustedSample out;
        const long long t0 = unixNow();
        HINTERNET ses = WinHttpOpen(XOR(L"Mozilla/5.0").c_str(), WINHTTP_ACCESS_TYPE_NO_PROXY,
            WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!ses) return out;
        WinHttpSetTimeouts(ses, 3000, 3000, 3000, 3000);
        HINTERNET con = WinHttpConnect(ses, host, port, 0);
        if (!con) { WinHttpCloseHandle(ses); return out; }
        DWORD flags = (port == 443) ? WINHTTP_FLAG_SECURE : 0;
        HINTERNET req = WinHttpOpenRequest(con, XOR(L"GET").c_str(), path, nullptr, WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!req) {
            WinHttpCloseHandle(con);
            WinHttpCloseHandle(ses);
            return out;
        }
        if (port == 443) {
            DWORD sec = SECURITY_FLAG_IGNORE_CERT_DATE_INVALID;
            WinHttpSetOption(req, WINHTTP_OPTION_SECURITY_FLAGS, &sec, sizeof(sec));
        }

        std::string body;
        long long dateUnix = 0;
        if (WinHttpSendRequest(req, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)
            && WinHttpReceiveResponse(req, nullptr)) {
            wchar_t date[128] = {};
            DWORD sz = sizeof(date);
            if (WinHttpQueryHeaders(req, WINHTTP_QUERY_DATE, WINHTTP_HEADER_NAME_BY_INDEX,
                    date, &sz, WINHTTP_NO_HEADER_INDEX)) {
                dateUnix = parseHttpDateUnix(date);
            }
            if (parseTrace) {
                DWORD avail = 0;
                while (WinHttpQueryDataAvailable(req, &avail) && avail > 0 && body.size() < 4096) {
                    DWORD take = avail;
                    if (body.size() + take > 4096) take = (DWORD)(4096 - body.size());
                    std::string chunk(take, '\0');
                    DWORD read = 0;
                    if (!WinHttpReadData(req, &chunk[0], take, &read) || !read) break;
                    body.append(chunk, 0, read);
                }
            }
        }
        WinHttpCloseHandle(req);
        WinHttpCloseHandle(con);
        WinHttpCloseHandle(ses);
        const long long t1 = unixNow();
        out.localMid = t0 + ((t1 - t0) / 2);
        if (parseTrace) {
            const long long ts = parseCfTraceTs(body);
            if (ts >= kMinUnixSane) out.remoteUnix = ts;
        }
        if (out.remoteUnix < kMinUnixSane) out.remoteUnix = dateUnix;
        if (!body.empty()) SecureZeroMemory(&body[0], body.size());
        return out;
    }

    inline unsigned short ntpHtons(unsigned short v) {
        return (unsigned short)((v << 8) | (v >> 8));
    }
    inline unsigned long ntpNtohl(unsigned long v) {
        return ((v & 0xFFul) << 24) | ((v & 0xFF00ul) << 8)
            | ((v & 0xFF0000ul) >> 8) | (v >> 24);
    }

    inline bool ipv4IsRoutablePublic(ULONG addr) {
        const unsigned b0 = (unsigned)(addr & 0xFFu);
        const unsigned b1 = (unsigned)((addr >> 8) & 0xFFu);
        if (b0 == 0 || b0 == 10 || b0 == 127 || b0 >= 224) return false;
        if (b0 == 192 && b1 == 168) return false;
        if (b0 == 169 && b1 == 254) return false;
        if (b0 == 172 && b1 >= 16 && b1 <= 31) return false;
        if (b0 == 100 && b1 >= 64 && b1 <= 127) return false;
        return true;
    }

    // UDP NTP (port 123). Independent of WinHTTP Date and of Windows auto-sync.
    inline TrustedSample ntpFromIp(ULONG ipNetworkOrder) {
        TrustedSample out;
        if (!ipNetworkOrder || !ipv4IsRoutablePublic(ipNetworkOrder)) return out;

        HMODULE ws = GetModuleHandleA("ws2_32.dll");
        if (!ws) ws = LoadLibraryA("ws2_32.dll");
        if (!ws) return out;

        typedef int (WINAPI* PFN_WSAStartup)(WORD, void*);
        typedef UINT_PTR(WINAPI* PFN_socket)(int, int, int);
        typedef int (WINAPI* PFN_closesocket)(UINT_PTR);
        typedef int (WINAPI* PFN_sendto)(UINT_PTR, const char*, int, int, const void*, int);
        typedef int (WINAPI* PFN_recvfrom)(UINT_PTR, char*, int, int, void*, int*);
        typedef int (WINAPI* PFN_setsockopt)(UINT_PTR, int, int, const char*, int);
        auto pWSAStartup = (PFN_WSAStartup)GetProcAddress(ws, "WSAStartup");
        auto pSocket = (PFN_socket)GetProcAddress(ws, "socket");
        auto pClose = (PFN_closesocket)GetProcAddress(ws, "closesocket");
        auto pSendTo = (PFN_sendto)GetProcAddress(ws, "sendto");
        auto pRecvFrom = (PFN_recvfrom)GetProcAddress(ws, "recvfrom");
        auto pSetOpt = (PFN_setsockopt)GetProcAddress(ws, "setsockopt");
        if (!pWSAStartup || !pSocket || !pClose || !pSendTo || !pRecvFrom || !pSetOpt)
            return out;

        unsigned char wsaBuf[1024] = {};
        if (pWSAStartup(0x0202, wsaBuf) != 0) return out;

        UINT_PTR s = pSocket(2 /*AF_INET*/, 2 /*SOCK_DGRAM*/, 17 /*IPPROTO_UDP*/);
        if (s == (UINT_PTR)(~0) || s == 0)
            return out;
        DWORD timeoutMs = 1200;
        pSetOpt(s, 0xFFFF /*SOL_SOCKET*/, 0x1006 /*SO_RCVTIMEO*/, (const char*)&timeoutMs, sizeof(timeoutMs));

        unsigned char pkt[48] = {};
        pkt[0] = 0x1B; // LI=0 VN=3 Mode=3
        struct { short family; unsigned short port; unsigned long addr; char zero[8]; } dst = {};
        dst.family = 2;
        dst.port = ntpHtons(123);
        dst.addr = ipNetworkOrder;
        const long long t0 = unixNow();
        if (pSendTo(s, (const char*)pkt, 48, 0, &dst, sizeof(dst)) != 48) {
            pClose(s);
            return out;
        }
        unsigned char reply[48] = {};
        int fromLen = sizeof(dst);
        const int n = pRecvFrom(s, (char*)reply, 48, 0, &dst, &fromLen);
        const long long t1 = unixNow();
        pClose(s);
        if (n < 48) return out;
        if ((reply[0] & 0x07) != 4) return out; // mode server
        if (reply[1] == 0) return out;          // stratum 0 / kiss-of-death

        unsigned long ntpSec = 0;
        memcpy(&ntpSec, reply + 40, 4);
        ntpSec = ntpNtohl(ntpSec);
        if (ntpSec < 2208988800ul) return out;
        out.localMid = t0 + ((t1 - t0) / 2);
        out.remoteUnix = (long long)ntpSec - 2208988800LL;
        return out;
    }

    inline TrustedSample ntpTrustedSample(const wchar_t* host) {
        TrustedSample out;
        PDNS_RECORD rec = nullptr;
        if (DnsQuery_W(host, DNS_TYPE_A, DNS_QUERY_STANDARD, nullptr, &rec, nullptr) != 0 || !rec)
            return out;
        ULONG ip = 0;
        for (PDNS_RECORD p = rec; p; p = p->pNext) {
            if (p->wType == DNS_TYPE_A) { ip = p->Data.A.IpAddress; break; }
        }
        DnsRecordListFree(rec, DnsFreeRecordList);
        if (!ip || !ipv4IsRoutablePublic(ip)) return out;
        return ntpFromIp(ip);
    }

    inline void noteRemoteUtc(long long remoteUnix) {
        if (remoteUnix < kMinUnixSane) return;
        remoteAnchorUnix().store(remoteUnix, std::memory_order_relaxed);
        remoteAnchorMonoMs().store(monoMs(), std::memory_order_relaxed);
        trustedOffsetSec().store(remoteUnix - unixNow(), std::memory_order_relaxed);
    }

    inline std::atomic<long long>& authAnchorMonoMs() {
        static std::atomic<long long> v{0};
        return v;
    }
    inline std::atomic<long long>& authAnchorUnix() {
        static std::atomic<long long> v{0};
        return v;
    }

    inline void noteAuthServerUtc(long long unixSec) {
        if (unixSec < kMinUnixSane) return;
        authAnchorUnix().store(unixSec, std::memory_order_relaxed);
        authAnchorMonoMs().store(monoMs(), std::memory_order_relaxed);
        noteRemoteUtc(unixSec);
    }

    inline bool processStartWasDelayed() {
        const LONG64 t0 = g_processStartTick;
        if (t0 <= 0) return false;
        return ((LONG64)GetTickCount64() - t0) > 4000;
    }

    inline bool assertClockIntegrity() {
        // 1. Timezone alteration check
        if (!assertTzIntegrity()) {
            abortClockTamper();
            return false;
        }

        const long long wall = unixNow();
        const long long localWall = localUnixNow();
        const long long ticks = monoMs();

        long long wall0 = wallAnchorUnix().load(std::memory_order_relaxed);
        long long local0 = localWallAnchorUnix().load(std::memory_order_relaxed);
        long long tick0 = wallAnchorMonoMs().load(std::memory_order_relaxed);

        if (wall0 < kMinUnixSane || tick0 <= 0) {
            if (g_processStartUnix >= kMinUnixSane && g_processStartTick > 0) {
                wall0 = (long long)g_processStartUnix;
                tick0 = (long long)g_processStartTick;
                wallAnchorUnix().store(wall0, std::memory_order_relaxed);
                wallAnchorMonoMs().store(tick0, std::memory_order_relaxed);
            } else {
                wallAnchorUnix().store(wall, std::memory_order_relaxed);
                wallAnchorMonoMs().store(ticks, std::memory_order_relaxed);
                wall0 = wall;
                tick0 = ticks;
            }
        }
        if (local0 < kMinUnixSane) {
            localWallAnchorUnix().store(localWall, std::memory_order_relaxed);
            local0 = localWall;
        }

        // 2. Check local wall clock drift (detects timezone changes & manual hour edits)
        const long long expectedLocal = local0 + tickElapsedSec(tick0);
        if (llAbs(localWall - expectedLocal) > kLocalDriftSec) {
            abortClockTamper();
            return false;
        }

        // 3. Immediate detection of UTC hardware clock jumps (>5s)
        const long long expectedFromTicks = wall0 + tickElapsedSec(tick0);
        const long long localDrift = llAbs(wall - expectedFromTicks);
        if (localDrift > kLocalDriftSec) {
            abortClockTamper();
            return false;
        }

        // 4. Secondary check against process start baseline
        if (g_processStartUnix >= kMinUnixSane && g_processStartTick > 0) {
            const long long expectedFromStart = (long long)g_processStartUnix + tickElapsedSec((long long)g_processStartTick);
            if (llAbs(wall - expectedFromStart) > kLocalDriftSec) {
                abortClockTamper();
                return false;
            }
        }

        // 5. Tertiary check against remote NTP/HTTPS anchor if available
        const long long remote0 = remoteAnchorUnix().load(std::memory_order_relaxed);
        const long long remoteTick0 = remoteAnchorMonoMs().load(std::memory_order_relaxed);
        if (remote0 >= kMinUnixSane && remoteTick0 > 0) {
            const long long trueNow = remote0 + tickElapsedSec(remoteTick0);
            if (llAbs(wall - trueNow) > kTimeToleranceSec) {
                abortClockTamper();
                return false;
            }
        }

        static std::atomic<long long> lastEvtMs{0};
        if (ticks - lastEvtMs.load(std::memory_order_relaxed) >= 1000) {
            lastEvtMs.store(ticks, std::memory_order_relaxed);
            long long maxId = 0;
            if (recentLoggedTimeChange(maxId)) {
                if (maxId > 0) storeLastClockEventId(maxId);
                abortClockTamper();
                return false;
            }
        }
        return true;
    }

    inline void startContinuousClockWatchdog() {
        static std::atomic<bool> started{false};
        bool exp = false;
        if (!started.compare_exchange_strong(exp, true)) return;
        std::thread([]() {
            while (true) {
                Sleep(200);
                assertClockIntegrity();
            }
        }).detach();
    }

    inline void onWallClockChanged() {
        if (!assertTzIntegrity()) {
            abortClockTamper();
            return;
        }
        long long maxId = 0;
        if (recentLoggedTimeChange(maxId)) {
            if (maxId > 0) storeLastClockEventId(maxId);
            abortClockTamper();
            return;
        }

        const long long localWall = localUnixNow();
        const long long local0 = localWallAnchorUnix().load(std::memory_order_relaxed);
        const long long tick0 = wallAnchorMonoMs().load(std::memory_order_relaxed);
        if (local0 >= kMinUnixSane && tick0 > 0) {
            if (llAbs(localWall - (local0 + tickElapsedSec(tick0))) > kLocalDriftSec) {
                abortClockTamper();
                return;
            }
        }

        const long long wall = unixNow();
        const long long wall0 = wallAnchorUnix().load(std::memory_order_relaxed);
        if (wall0 >= kMinUnixSane && tick0 > 0) {
            if (llAbs(wall - (wall0 + tickElapsedSec(tick0))) > kLocalDriftSec) {
                abortClockTamper();
                return;
            }
        }
        if (g_processStartUnix >= kMinUnixSane && g_processStartTick > 0) {
            if (llAbs(wall - ((long long)g_processStartUnix + tickElapsedSec((long long)g_processStartTick))) > kLocalDriftSec) {
                abortClockTamper();
                return;
            }
        }
        requestClockReverify();
    }

    inline std::atomic<long long>& lastHttpsUnix() {
        static std::atomic<long long> v{0};
        return v;
    }

    inline bool queryTrustedUtc(long long& remoteOut, long long& localOut, bool useProcessStartLocal, bool skipCache) {
        (void)useProcessStartLocal;
        captureProcessStartClock();
        const long long curMonoMs = monoMs();
        localOut = unixNow();

        const long long baseRemote = remoteAnchorUnix().load(std::memory_order_relaxed);
        const long long baseMono = remoteAnchorMonoMs().load(std::memory_order_relaxed);

        if (!skipCache && baseRemote >= kMinUnixSane && baseMono > 0 && (curMonoMs - baseMono) < (120LL * 1000LL)) {
            remoteOut = baseRemote + tickElapsedSec(baseMono);
            localOut = unixNow();
            return true;
        }

        std::vector<TrustedSample> ntpSamples;
        std::vector<TrustedSample> httpSamples;
        ntpSamples.reserve(8);
        httpSamples.reserve(4);
        auto pushNtp = [&](TrustedSample s) { if (s.ok() && s.localMid >= kMinUnixSane) ntpSamples.push_back(s); };
        auto pushHttp = [&](TrustedSample s) { if (s.ok() && s.localMid >= kMinUnixSane) httpSamples.push_back(s); };

        const std::wstring ntpWin = XOR(L"time.windows.com");
        const std::wstring ntpGoogle = XOR(L"time.google.com");
        const std::wstring ntpCf = XOR(L"time.cloudflare.com");
        pushNtp(ntpTrustedSample(ntpWin.c_str()));
        pushNtp(ntpTrustedSample(ntpGoogle.c_str()));
        pushNtp(ntpTrustedSample(ntpCf.c_str()));
        pushNtp(ntpFromIp(0x01C89FA2ul /* 162.159.200.1 */));
        pushNtp(ntpFromIp(0x0023EFD8ul /* 216.239.35.0 */));
        pushNtp(ntpFromIp(0x0423EFD8ul /* 216.239.35.4 */));

        const std::wstring googleHost = XOR(L"www.google.com");
        const std::wstring googlePath = XOR(L"/generate_204");
        const std::wstring cfHost = XOR(L"www.cloudflare.com");
        const std::wstring cfPath = XOR(L"/");
        const std::wstring traceHost = XOR(L"one.one.one.one");
        const std::wstring tracePath = XOR(L"/cdn-cgi/trace");
        pushHttp(httpTrustedSample(googleHost.c_str(), 443, googlePath.c_str(), false));
        pushHttp(httpTrustedSample(cfHost.c_str(), 443, cfPath.c_str(), false));
        pushHttp(httpTrustedSample(traceHost.c_str(), 443, tracePath.c_str(), true));

        auto offsetOf = [](const TrustedSample& s) { return s.localMid - s.remoteUnix; };
        auto spanOk = [&](const std::vector<TrustedSample>& v) {
            if (v.size() < 2) return true;
            long long mn = offsetOf(v[0]), mx = offsetOf(v[0]);
            for (const auto& s : v) {
                const long long o = offsetOf(s);
                if (o < mn) mn = o;
                if (o > mx) mx = o;
            }
            return (mx - mn) <= kTimeToleranceSec;
        };
        auto medianOffset = [&](std::vector<TrustedSample> v) -> long long {
            if (v.empty()) return 0;
            std::sort(v.begin(), v.end(),
                [&](const TrustedSample& a, const TrustedSample& b) { return offsetOf(a) < offsetOf(b); });
            return offsetOf(v[v.size() / 2]);
        };

        if (!ntpSamples.empty() && !spanOk(ntpSamples))
            return false;
        if (!httpSamples.empty() && !spanOk(httpSamples))
            return false;

        const long long ntpOff = ntpSamples.empty() ? 0 : medianOffset(ntpSamples);
        const long long httpOff = httpSamples.empty() ? 0 : medianOffset(httpSamples);
        const bool haveNtp = !ntpSamples.empty();
        const bool haveHttp = !httpSamples.empty();

        // Fake local NTP can match a tampered clock. HTTPS Date / trace cannot
        // unless TLS is broken. If both exist and they disagree, prefer HTTPS.
        long long off = 0;
        if (haveHttp && haveNtp && llAbs(ntpOff - httpOff) > kTimeToleranceSec)
            off = httpOff;
        else if (haveHttp)
            off = httpOff;
        else if (haveNtp)
            off = ntpOff;
        else
            off = 0;

        const long long authBase = authAnchorUnix().load(std::memory_order_relaxed);
        const long long authMono = authAnchorMonoMs().load(std::memory_order_relaxed);
        const bool haveAuth = authBase >= kMinUnixSane && authMono > 0
            && (curMonoMs - authMono) < (300LL * 1000LL);
        if (haveAuth) {
            const long long authRemoteNow = authBase + tickElapsedSec(authMono);
            const long long authOff = localOut - authRemoteNow;
            if (!haveHttp && !haveNtp)
                off = authOff;
            else if (llAbs(off - authOff) > kTimeToleranceSec)
                off = authOff;
            else
                off = (off + authOff) / 2;
        } else if (!haveHttp && !haveNtp) {
            return false;
        }

        localOut = unixNow();
        remoteOut = localOut - off;
        if (haveHttp)
            lastHttpsUnix().store(localOut - httpOff, std::memory_order_relaxed);
        else
            lastHttpsUnix().store(0, std::memory_order_relaxed);

        noteRemoteUtc(remoteOut);
        return true;
    }

    inline std::atomic<LONG>& clockVerifyBusy() {
        static std::atomic<LONG> v{0};
        return v;
    }

    inline void requestClockReverify() {
        LONG expected = 0;
        if (!clockVerifyBusy().compare_exchange_strong(expected, 1))
            return;
        std::thread([]() {
            long long remote = 0, local = 0;
            const bool ok = queryTrustedUtc(remote, local, false, true);
            if (ok && remote >= kMinUnixSane) {
                if (llAbs(local - remote) > kTimeToleranceSec) {
                    abortClockTamper();
                    return;
                }
                noteRemoteUtc(remote);
                reanchorWallNow();
            }
            clockVerifyBusy().store(0, std::memory_order_relaxed);
        }).detach();
    }

    constexpr DWORD64 kLastSeenXor = 0xA5A5C3C3D2D2E1E1ULL;

    inline const std::wstring& clockRegKey() {
        static const std::wstring k = XOR(L"Software\\AuthSDK\\TrustedClock");
        return k;
    }

    inline bool dpapiProtectQword(DWORD64 plain, std::vector<BYTE>& blob) {
        DATA_BLOB in{}, out{};
        in.pbData = reinterpret_cast<BYTE*>(&plain);
        in.cbData = sizeof(plain);
        if (!CryptProtectData(&in, L"AuthSdkClock", nullptr, nullptr, nullptr,
                CRYPTPROTECT_UI_FORBIDDEN, &out))
            return false;
        blob.assign(out.pbData, out.pbData + out.cbData);
        SecureZeroMemory(out.pbData, out.cbData);
        LocalFree(out.pbData);
        return true;
    }

    inline bool dpapiUnprotectQword(const BYTE* data, DWORD len, DWORD64& plain) {
        if (!data || len < 16) return false;
        DATA_BLOB in{}, out{};
        in.pbData = const_cast<BYTE*>(data);
        in.cbData = len;
        if (!CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, 0, &out))
            return false;
        if (out.cbData != sizeof(DWORD64)) {
            SecureZeroMemory(out.pbData, out.cbData);
            LocalFree(out.pbData);
            return false;
        }
        memcpy(&plain, out.pbData, sizeof(plain));
        SecureZeroMemory(out.pbData, out.cbData);
        LocalFree(out.pbData);
        return true;
    }

    inline bool loadProtectedQword(const wchar_t* name, DWORD64& plain) {
        HKEY k = nullptr;
        if (RegOpenKeyExW(HKEY_CURRENT_USER, clockRegKey().c_str(), 0, KEY_QUERY_VALUE, &k) != ERROR_SUCCESS)
            return false;

        DWORD type = 0;
        DWORD sz = 0;
        LONG st = RegQueryValueExW(k, name, nullptr, &type, nullptr, &sz);
        if (st != ERROR_SUCCESS || sz == 0) {
            RegCloseKey(k);
            return false;
        }

        std::vector<BYTE> buf(sz);
        st = RegQueryValueExW(k, name, nullptr, &type, buf.data(), &sz);
        RegCloseKey(k);
        if (st != ERROR_SUCCESS) return false;

        if (type == REG_BINARY && dpapiUnprotectQword(buf.data(), sz, plain))
            return true;

        if (type == REG_QWORD && sz == sizeof(DWORD64)) {
            DWORD64 enc = 0;
            memcpy(&enc, buf.data(), sizeof(enc));
            plain = enc ^ kLastSeenXor;
            return true;
        }
        return false;
    }

    inline void storeProtectedQword(const wchar_t* name, DWORD64 plain) {
        std::vector<BYTE> blob;
        if (!dpapiProtectQword(plain, blob) || blob.empty()) return;

        HKEY k = nullptr;
        DWORD disp = 0;
        if (RegCreateKeyExW(HKEY_CURRENT_USER, clockRegKey().c_str(), 0, nullptr, 0,
                KEY_SET_VALUE, nullptr, &k, &disp) != ERROR_SUCCESS)
            return;
        RegSetValueExW(k, name, 0, REG_BINARY, blob.data(), (DWORD)blob.size());
        RegCloseKey(k);
        SecureZeroMemory(blob.data(), blob.size());
    }

    inline long long loadLastSeenUnix() {
        const std::wstring val = XOR(L"LastSeen");
        DWORD64 raw = 0;
        if (!loadProtectedQword(val.c_str(), raw)) return 0;
        const long long u = (long long)raw;
        if (u < kMinUnixSane) return 0;
        return u;
    }

    inline void storeLastSeenUnix(long long u) {
        if (u < kMinUnixSane) return;
        const std::wstring val = XOR(L"LastSeen");
        storeProtectedQword(val.c_str(), (DWORD64)u);
    }

    inline long long loadLastClockEventId() {
        const std::wstring val = XOR(L"ClockEvent");
        DWORD64 raw = 0;
        if (!loadProtectedQword(val.c_str(), raw)) return 0;
        return (long long)raw;
    }

    inline void storeLastClockEventId(long long id) {
        if (id <= 0) return;
        const std::wstring val = XOR(L"ClockEvent");
        storeProtectedQword(val.c_str(), (DWORD64)id);
    }

    inline bool loadClockTamperLatch() {
        const std::wstring val = XOR(L"TamperLatch");
        DWORD64 raw = 0;
        if (!loadProtectedQword(val.c_str(), raw)) return false;
        return raw == 1;
    }

    inline void storeClockTamperLatch(bool on) {
        const std::wstring val = XOR(L"TamperLatch");
        storeProtectedQword(val.c_str(), on ? 1ull : 0ull);
    }

    inline long long parseIso8601UnixW(const wchar_t* s) {
        if (!s) return 0;
        auto take = [&](int n) -> int {
            int v = 0;
            for (int i = 0; i < n; i++) {
                if (s[i] < L'0' || s[i] > L'9') return -1;
                v = v * 10 + (s[i] - L'0');
            }
            s += n;
            return v;
        };
        const int y = take(4);
        if (y < 0 || *s++ != L'-') return 0;
        const int mo = take(2);
        if (mo < 0 || *s++ != L'-') return 0;
        const int d = take(2);
        if (d < 0 || (*s != L'T' && *s != L' ')) return 0;
        s++;
        const int hh = take(2);
        if (hh < 0 || *s++ != L':') return 0;
        const int mm = take(2);
        if (mm < 0 || *s++ != L':') return 0;
        const int ss = take(2);
        if (ss < 0) return 0;
        return civilToUnixUtc(y, mo, d, hh, mm, ss);
    }

    inline long long xmlTimeCreatedUnix(const wchar_t* xml) {
        const wchar_t* p = wcsstr(xml, L"TimeCreated");
        if (!p) return 0;
        p = wcsstr(p, L"SystemTime=");
        if (!p) return 0;
        p += 11;
        if (*p == L'\'' || *p == L'"') p++;
        return parseIso8601UnixW(p);
    }

    inline long long xmlNamedTimeUnix(const wchar_t* xml, const wchar_t* name) {
        const wchar_t* p = wcsstr(xml, name);
        if (!p) return 0;
        p = wcschr(p, L'>');
        if (!p || !p[1]) return 0;
        return parseIso8601UnixW(p + 1);
    }

    inline long long xmlIntAfterName(const wchar_t* xml, const wchar_t* name) {
        const wchar_t* p = wcsstr(xml, name);
        if (!p) return 0;
        p = wcschr(p, L'>');
        if (!p || !p[1]) return 0;
        p++;
        bool neg = false;
        if (*p == L'-') { neg = true; p++; }
        long long v = 0;
        while (*p >= L'0' && *p <= L'9') {
            v = v * 10 + (*p - L'0');
            p++;
        }
        return neg ? -v : v;
    }

    inline bool xmlHasI(const wchar_t* xml, const wchar_t* needle) {
        if (!xml || !needle || !needle[0]) return false;
        const size_t nlen = wcslen(needle);
        for (const wchar_t* p = xml; *p; p++) {
            size_t i = 0;
            while (i < nlen && p[i] && ((p[i] | 32) == (needle[i] | 32))) i++;
            if (i == nlen) return true;
        }
        return false;
    }

    // Win11 + auto time: Settings logs Event 1 with TimeDeltaInMs=0. Block once per
    // new event id, then allow the next launch if the clock matches NTP again.
    inline bool recentLoggedTimeChange(long long& maxIdOut) {
        maxIdOut = 0;
        EVT_HANDLE hQuery = EvtQuery(nullptr, L"System",
            L"*[System[Provider[@Name='Microsoft-Windows-Kernel-General'] and (EventID=1)]]",
            EvtQueryChannelPath | EvtQueryReverseDirection);
        if (!hQuery) return false;

        bool hasManualTamper = false;
        EVT_HANDLE ev[40] = {};
        DWORD n = 0;
        if (EvtNext(hQuery, 40, ev, 400, 0, &n)) {
            for (DWORD i = 0; i < n; i++) {
                DWORD used = 0, props = 0;
                EvtRender(nullptr, ev[i], EvtRenderEventXml, 0, nullptr, &used, &props);
                if (used == 0) {
                    EvtClose(ev[i]);
                    continue;
                }
                std::vector<wchar_t> xml(used / sizeof(wchar_t) + 4, 0);
                if (!EvtRender(nullptr, ev[i], EvtRenderEventXml, used, xml.data(), &used, &props)) {
                    EvtClose(ev[i]);
                    continue;
                }
                const long long recId = xmlIntAfterName(xml.data(), L"EventRecordID");
                if (recId > maxIdOut) maxIdOut = recId;

                const bool fromSettings = xmlHasI(xml.data(), L"SystemSettings.exe")
                    || xmlHasI(xml.data(), L"SystemSettingsAdminFlows.exe")
                    || xmlHasI(xml.data(), L"timedate.cpl")
                    || xmlHasI(xml.data(), L"ImmersiveControlPanel")
                    || xmlHasI(xml.data(), L"DateAndTime");
                const bool fromTimeService = xmlHasI(xml.data(), L"svchost.exe")
                    || xmlHasI(xml.data(), L"W32Time")
                    || xmlHasI(xml.data(), L"TimeBroker")
                    || xmlHasI(xml.data(), L"w32tm");

                if (i == 0 && fromSettings && !fromTimeService) {
                    hasManualTamper = true;
                } else if (fromSettings && !fromTimeService && i < 3) {
                    hasManualTamper = true;
                } else if (fromTimeService) {
                    break;
                }

                EvtClose(ev[i]);
            }
        }
        EvtClose(hQuery);
        return hasManualTamper;
    }

    inline long long moduleWriteUnix() {
        wchar_t path[MAX_PATH] = {};
        if (!GetModuleFileNameW(nullptr, path, MAX_PATH)) return 0;
        WIN32_FILE_ATTRIBUTE_DATA fad = {};
        if (!GetFileAttributesExW(path, GetFileExInfoStandard, &fad)) return 0;
        return fileTimeToUnix(fad.ftLastWriteTime);
    }

    inline __declspec(noinline) void guardClockAtStartup() {
        captureProcessStartClock();

        long long maxEventId = 0;
        const bool newSettings = recentLoggedTimeChange(maxEventId);

        const long long now = unixNow();
        const long long last = loadLastSeenUnix();
        const bool clockWentBack = (last >= kMinUnixSane && now + kLocalDriftSec < last);

        const long long built = moduleWriteUnix();
        const bool beforeBuild = (built >= kMinUnixSane && now + 60 < built);

        long long remote = 0, local = 0;
        const bool gotRemote = queryTrustedUtc(remote, local, false, true);
        long long skew = 0;
        if (gotRemote) {
            noteRemoteUtc(remote);
            skew = llAbs(local - remote);
            if (g_processStartTick > 0) {
                const long long trueAtStart = remote - tickElapsedSec(g_processStartTick);
                const long long frozen = frozenLocalUnix();
                if (frozen >= kMinUnixSane && llAbs(frozen - trueAtStart) > kTimeToleranceSec)
                    skew = (std::max)(skew, llAbs(frozen - trueAtStart));
            }
        }
        const bool clockWrong = gotRemote && skew > kTimeToleranceSec;

        // Block if clock is wrong, went back, or is before build timestamp
        if (clockWrong || clockWentBack || beforeBuild) {
            abortClockTamper();
            return;
        }

        // If a manual settings time change occurred, ALWAYS block unless clock is proven strictly correct via network
        if (newSettings && (!gotRemote || skew > 5)) {
            abortClockTamper();
            return;
        }

        if (maxEventId > 0)
            storeLastClockEventId(maxEventId);

        storeClockTamperLatch(false);
        const long long alignedWall = unixNow();
        wallAnchorUnix().store(alignedWall, std::memory_order_relaxed);
        localWallAnchorUnix().store(localUnixNow(), std::memory_order_relaxed);
        wallAnchorMonoMs().store(monoMs(), std::memory_order_relaxed);
        storeLastSeenUnix(alignedWall);
    }

    inline bool enforceTrustedClock(bool requireRemote = false) {
        assertClockIntegrity();
        long long remote = 0, local = 0;
        if (!queryTrustedUtc(remote, local, false, true)) {
            return !requireRemote;
        }
        noteRemoteUtc(remote);
        if (llAbs(local - remote) > kTimeToleranceSec) {
            abortClockTamper();
            return false;
        }
        reanchorWallNow();
        return true;
    }

    inline bool hostLooksLoopback(const std::string& host) {
        if (host.empty()) return false;
        std::string h = host;
        for (char& c : h) c = (char)tolower((unsigned char)c);
        if (h == XOR("localhost").c_str()) return true;
        if (h == XOR("127.0.0.1").c_str()) return true;
        if (h == XOR("::1").c_str()) return true;
        if (h == XOR("0.0.0.0").c_str()) return true;
        if (h.rfind(XOR("127.").c_str(), 0) == 0) return true;
        return false;
    }

    inline std::string hostFromUrl(const std::string& serverUrl) {
        std::string host = serverUrl;
        auto p = host.find(XOR("://").c_str());
        if (p != std::string::npos) host = host.substr(p + 3);
        auto slash = host.find_first_of("/:");
        if (slash != std::string::npos) host = host.substr(0, slash);
        while (!host.empty() && (host.back() == '/' || host.back() == '.')) host.pop_back();
        return host;
    }

    inline bool dnsResolvesLoopback(const std::string& host) {
        if (host.empty()) return false;
        std::wstring wh(host.begin(), host.end());
        PDNS_RECORD rec = nullptr;
        const DNS_STATUS st = DnsQuery_W(wh.c_str(), DNS_TYPE_A, DNS_QUERY_STANDARD, nullptr, &rec, nullptr);
        bool loop = false;
        if (st == 0 && rec) {
            for (PDNS_RECORD p = rec; p; p = p->pNext) {
                if (p->wType != DNS_TYPE_A) continue;
                const BYTE* b = reinterpret_cast<const BYTE*>(&p->Data.A.IpAddress);
                if (b[0] == 127) { loop = true; break; }
            }
            DnsRecordListFree(rec, DnsFreeRecordList);
        }
        rec = nullptr;
        if (!loop) {
            const DNS_STATUS st6 = DnsQuery_W(wh.c_str(), DNS_TYPE_AAAA, DNS_QUERY_STANDARD, nullptr, &rec, nullptr);
            if (st6 == 0 && rec) {
                for (PDNS_RECORD p = rec; p; p = p->pNext) {
                    if (p->wType != DNS_TYPE_AAAA) continue;
                    const BYTE* b = reinterpret_cast<const BYTE*>(&p->Data.AAAA.Ip6Address);
                    bool isV6Loop = true;
                    for (int i = 0; i < 15; i++) {
                        if (b[i] != 0) { isV6Loop = false; break; }
                    }
                    if (isV6Loop && b[15] == 1) { loop = true; break; }
                }
                DnsRecordListFree(rec, DnsFreeRecordList);
            }
        }
        SecureZeroMemory(&wh[0], wh.size() * sizeof(wchar_t));
        return loop;
    }

    inline void rejectSpoofedAuthHost(const std::string& serverUrl) {
        const std::string https = XOR("https://");
        if (serverUrl.size() < https.size()
            || serverUrl.compare(0, https.size(), https) != 0) {
            hardAbort();
        }
        const std::string host = hostFromUrl(serverUrl);
        if (hostLooksLoopback(host) || dnsResolvesLoopback(host))
            hardAbort();
        const std::string dohIp = dohResolveIPv4(host);
        if (!dohIp.empty() && hostLooksLoopback(dohIp))
            hardAbort();
    }

}
