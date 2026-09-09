export const ruleSetSources = {
  geositeChina: {
    revision: '5a5a9abc760d2653948c9549c4cb56cc3279e1aa',
    sha256: '4c6935a585c10d5efe62c0d904bfa7ce004860b33a59fa52ba3db15553fde3bc',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/5a5a9abc760d2653948c9549c4cb56cc3279e1aa/geosite-geolocation-cn.srs',
  },
  geositeNonChina: {
    revision: '5a5a9abc760d2653948c9549c4cb56cc3279e1aa',
    sha256: '89262266c3131aa5404edabb6802f35fa7031c431d81dd1f29fbb20d6c2016e5',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/5a5a9abc760d2653948c9549c4cb56cc3279e1aa/geosite-geolocation-%21cn.srs',
  },
  geoIpChina: {
    revision: 'b9c5e675b4d5359d4b47f4434fa7ae77e9991306',
    sha256: '0acf5dad38fba9db2dade29ce5e4edc6902220944f30628ae46ed16cb0ec5edd',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/b9c5e675b4d5359d4b47f4434fa7ae77e9991306/geoip-cn.srs',
  },
} as const;
