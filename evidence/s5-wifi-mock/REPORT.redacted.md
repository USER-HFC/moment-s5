# DC-S5 Wi-Fi field report (redacted)

Generated: 2026-10-14T09:45:56.070219+00:00

Only mock results are software evidence; real DC-S5 feasibility requires field measurements.

Threshold: full 3 s pre-shutter window, max gap and last-frame age ≤500 ms, ≥10 unique JPEG hashes/s; original bytes must match SD SHA-256.

Raw responses, datagram hex, credentials, images, GPS and bugreports are excluded. Review this summary before sharing.

## auth.json

```json
{
  "camera_ip": "127.0.0.1",
  "flow": "legacy",
  "recorded_utc": "2026-10-14T09:45:44.426686+00:00",
  "replies": [
    {
      "format": "xml",
      "ok": true,
      "result": "ok",
      "values": {}
    }
  ],
  "session_received": false,
  "status": "accepted; confirm on camera if prompted"
}
```

## baseline.json

```json
{
  "camera_ip": "127.0.0.1",
  "complete": true,
  "containers": [],
  "control_url": "http://127.0.0.1:65394/Server0/CDS_control",
  "items": [
    {
      "id": "fixture-0000",
      "kind": "item",
      "parent_id": "0",
      "resources": [
        {
          "attributes": {
            "PANASONIC.COM_PN": "CAM_LRGTN"
          },
          "flag": "CAM_LRGTN",
          "mime": "image/jpeg",
          "original_filename": null,
          "protocolInfo": "http-get:*:image/jpeg:PANASONIC.COM_PN=CAM_LRGTN",
          "resolution": null,
          "size": 500,
          "transport": "http-get",
          "url": "http://127.0.0.1:65394/thumb/fixture-0000.JPG"
        },
        {
          "attributes": {
            "OriginalFileName": "fixture-0000.JPG",
            "PANASONIC.COM_PN": "CAM_ORG"
          },
          "flag": "CAM_ORG",
          "mime": "application/octet-stream",
          "original_filename": "fixture-0000.JPG",
          "protocolInfo": "http-get:*:application/octet-stream;PANASONIC.COM_PN=CAM_ORG;OriginalFileName='fixture-0000.JPG'",
          "resolution": "512x384",
          "size": 2252,
          "transport": "http-get",
          "url": "http://127.0.0.1:65394/original/fixture-0000.JPG"
        }
      ],
      "slot": null,
      "title": "fixture-0000.JPG"
    }
  ],
  "object_id": "0",
  "recorded_utc": "2026-10-14T09:45:50.053095+00:00"
}
```

## discovery.json

```json
{
  "camera_ip": "127.0.0.1",
  "devices": [
    {
      "description_url": "http://127.0.0.1:65394/Lumix/Server0/ddd",
      "firmware": "mock-1",
      "friendlyName": "[redacted]",
      "manufacturer": "Self-authored fixture",
      "model": "MOCK-DC-S5",
      "model_number": "fixture",
      "serial_number": "[redacted]",
      "services": [
        {
          "SCPDURL": "http://127.0.0.1:65394/cds.xml",
          "controlURL": "http://127.0.0.1:65394/Server0/CDS_control",
          "serviceId": "urn:upnp-org:serviceId:ContentDirectory",
          "serviceType": "urn:schemas-upnp-org:service:ContentDirectory:1"
        }
      ],
      "udn": "[redacted]"
    }
  ],
  "errors": [],
  "getstate": {
    "format": "xml",
    "ok": true,
    "result": "ok",
    "values": {
      "cammode": [
        "recmode"
      ]
    }
  },
  "recorded_utc": "2026-10-14T09:45:44.246021+00:00",
  "ssdp": [
    {
      "location": "http://127.0.0.1:65394/Lumix/Server0/ddd",
      "st": "urn:schemas-upnp-org:device:MediaServer:1"
    }
  ],
  "unicast_ssdp": true
}
```

## liveview.json

```json
{
  "all_measured_windows_passed": true,
  "camera_ip": "127.0.0.1",
  "complete_fps": 14.38136414799946,
  "complete_frames": 72,
  "dimensions": [
    {
      "frames": 73,
      "height": 48,
      "width": 64
    }
  ],
  "dropped_partial_frames": 0,
  "duration_seconds": 5.006479167,
  "errors": [],
  "foreign_packets_ignored": 0,
  "framing": "datagram",
  "invalid_datagrams": 0,
  "last_3s_gate": {
    "complete_frames": 43,
    "full_window": true,
    "last_frame_age_ms": 7.6219169999998115,
    "max_allowed_gap_ms": 500,
    "max_gap_ms": 72.07970799999997,
    "passed": true,
    "target_unique_fps": 10,
    "unique_fps": 14.333333333333334,
    "unique_frames": 43,
    "window_seconds": 3.0
  },
  "last_frame_age_ms": 7.6219169999998115,
  "loss_rate": null,
  "loss_rate_note": "No known S5 sequence format; packet/frame loss rate not inferred",
  "max_gap_ms": 72.37379099999997,
  "packet_sizes": {
    "361": 1,
    "362": 72
  },
  "pending_partial_bytes": 0,
  "recorded_utc": "2026-10-14T09:45:49.871993+00:00",
  "rolling_3s_windows": [
    {
      "complete_frames": 43,
      "full_window": true,
      "last_frame_age_ms": 40.38729200000013,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.37379099999997,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.333333333333334,
      "unique_frames": 43,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 48.33858300000004,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.1357920000001,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 52.17291700000004,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.1357920000001,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 61.54812499999984,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.07970799999997,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 43,
      "full_window": true,
      "last_frame_age_ms": 1.1427499999996371,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.07970799999997,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.333333333333334,
      "unique_frames": 43,
      "window_seconds": 3.0
    }
  ],
  "udp_port": 57495,
  "unique_fps": 14.38136414799946,
  "unique_frames": 72,
  "validation": "JPEG marker/SOF/SOS envelope; entropy decoding is not performed"
}
```

## prebuffer/manifest.json

```json
{
  "frames": [
    {
      "filename": "pre-0000.jpg",
      "relative_to_capture_ms": -2952.6108330000006,
      "sha256": "37ecc181ebb4eda601ceedb7d59b4ed9ae1d82c716b7ec1c7973ec01bf9134e3"
    },
    {
      "filename": "pre-0001.jpg",
      "relative_to_capture_ms": -2882.9310420000006,
      "sha256": "039f808b0709e24463a457b32278af1c44758b5028bce6baa520132de556266b"
    },
    {
      "filename": "pre-0002.jpg",
      "relative_to_capture_ms": -2812.2375,
      "sha256": "bf9b44649dd581bda0ca3a71b1663b7335d92831b848313be6a4e4a5ac04734d"
    },
    {
      "filename": "pre-0003.jpg",
      "relative_to_capture_ms": -2741.7553330000005,
      "sha256": "80db0130eb285877498397df0d2ca36f2699dc164da2173bd2ddec07def593d7"
    },
    {
      "filename": "pre-0004.jpg",
      "relative_to_capture_ms": -2670.4508330000003,
      "sha256": "96c0189308e4cd3a6014db70af4768785fb621ee3f396e216dcea1e2c01a555c"
    },
    {
      "filename": "pre-0005.jpg",
      "relative_to_capture_ms": -2599.4426670000003,
      "sha256": "02a8dfcf98d3a6d24995857cf270073be8f36e59aa82a62b847171977b4a8938"
    },
    {
      "filename": "pre-0006.jpg",
      "relative_to_capture_ms": -2531.4461670000005,
      "sha256": "72fde024ada3e71b0fa432ef788793e26c7d9338fa29a28ea97c5d082d29559c"
    },
    {
      "filename": "pre-0007.jpg",
      "relative_to_capture_ms": -2459.5374170000005,
      "sha256": "f0c081b720a3a63b7a6a0c4195e24defb72b156fa4eb03881f62ceac5e53f6f7"
    },
    {
      "filename": "pre-0008.jpg",
      "relative_to_capture_ms": -2388.509958,
      "sha256": "d3ed462b78629a8bf1f67f117909c3e62589ea8e007511db7983c6ed842abca1"
    },
    {
      "filename": "pre-0009.jpg",
      "relative_to_capture_ms": -2319.552,
      "sha256": "c3386ac772bb4c1735e7f334ae81f5b66717325c02613e5e1d3dbed2dfedfa4c"
    },
    {
      "filename": "pre-0010.jpg",
      "relative_to_capture_ms": -2248.7506670000002,
      "sha256": "44377587ea37f812375d61867b84722eb7ad707f0dd2bcc68161d4c5fc00c0b7"
    },
    {
      "filename": "pre-0011.jpg",
      "relative_to_capture_ms": -2179.5370000000003,
      "sha256": "13770b4a721c94fc7e1d70e85d7c05673140214b7fb09e99aca75e4573086d38"
    },
    {
      "filename": "pre-0012.jpg",
      "relative_to_capture_ms": -2107.7045420000004,
      "sha256": "988e0f2d3170bbee351a2cb900fd16d8fa6fc7bd027297c539be8696e8b33dc3"
    },
    {
      "filename": "pre-0013.jpg",
      "relative_to_capture_ms": -2040.3147080000003,
      "sha256": "119b87a45efa9206757a5f4f995a231ce24dd6a94d1908f783622e0814e8bbec"
    },
    {
      "filename": "pre-0014.jpg",
      "relative_to_capture_ms": -1969.7509580000005,
      "sha256": "c1f4be779cfc171cd9e53d0db882b507519ab27bee8a12df39eaef7276d361a4"
    },
    {
      "filename": "pre-0015.jpg",
      "relative_to_capture_ms": -1898.6891670000005,
      "sha256": "c65312f8e0d48c0e64db2d61cf045a655d80fc1b76f6f2e032f75cd8a4815b5f"
    },
    {
      "filename": "pre-0016.jpg",
      "relative_to_capture_ms": -1827.1093330000006,
      "sha256": "4c0d42332f0f4949fa13a88756c457d11cb51bc904b296ede72f790323b00d85"
    },
    {
      "filename": "pre-0017.jpg",
      "relative_to_capture_ms": -1755.2242080000005,
      "sha256": "c649f6a93a7a672dadd11a2db9db2812039f476aff6941d4c81e8a20f4814225"
    },
    {
      "filename": "pre-0018.jpg",
      "relative_to_capture_ms": -1685.7958750000003,
      "sha256": "642c9bbf9c65061319b610e13566db0bd1d8d45981fd26cf2abc6bbe97efcb8b"
    },
    {
      "filename": "pre-0019.jpg",
      "relative_to_capture_ms": -1614.1537920000003,
      "sha256": "1d227e3f36e8e8b7e5023ef8f78cf1da51dab1d37dd3336870223a679f14fba8"
    },
    {
      "filename": "pre-0020.jpg",
      "relative_to_capture_ms": -1542.2177920000001,
      "sha256": "3493fd9c12db7a5cc7d2ddff44739de46abcc919b537e7c2d352ad48db3e3957"
    },
    {
      "filename": "pre-0021.jpg",
      "relative_to_capture_ms": -1470.2958330000001,
      "sha256": "482fb7c8b1711d17ac4b4355f7133e36000ef7089b3c68f105c4da30b7522d78"
    },
    {
      "filename": "pre-0022.jpg",
      "relative_to_capture_ms": -1399.0819170000002,
      "sha256": "b0b6156b5e8241f2c4bcfe9b61f380f94ba211921568c51ebbf0ac9ee70896c3"
    },
    {
      "filename": "pre-0023.jpg",
      "relative_to_capture_ms": -1326.9874580000005,
      "sha256": "065aad0e81068357a07dcd8c709e42bd38d38ae6eb6a21f7aa41f0ce8e2c3b61"
    },
    {
      "filename": "pre-0024.jpg",
      "relative_to_capture_ms": -1259.8421250000006,
      "sha256": "4f1cd7ee7681ae4f68d819b2b34401cc013f392afe67f8aa1b7e7e4f9e1e2f06"
    },
    {
      "filename": "pre-0025.jpg",
      "relative_to_capture_ms": -1191.1857500000003,
      "sha256": "abe502c550e46f82345fca689d76d1b06e0c673f8241488dce999d33812fccce"
    },
    {
      "filename": "pre-0026.jpg",
      "relative_to_capture_ms": -1122.4530829999999,
      "sha256": "012686e549f3cf6e45c6ade3ad55ec190867400e82f95853dff88f29c776c4b4"
    },
    {
      "filename": "pre-0027.jpg",
      "relative_to_capture_ms": -1051.0286670000007,
      "sha256": "e66937c2a757a9e5912d06717ab8839f2628190739addab0ad9b7406f29188e2"
    },
    {
      "filename": "pre-0028.jpg",
      "relative_to_capture_ms": -979.4761250000006,
      "sha256": "36dedd9d284934676f391584b6d17b4e816544beef3150a5804ef60dbd84e2c5"
    },
    {
      "filename": "pre-0029.jpg",
      "relative_to_capture_ms": -907.7600830000003,
      "sha256": "e21dc92b0289187fb9ce3a330dd649190b8b3d7656013bbf73f3063a0898668f"
    },
    {
      "filename": "pre-0030.jpg",
      "relative_to_capture_ms": -837.202917,
      "sha256": "12e5cb1ffd4fa1e7aaaa8e9b4b96fa373999fbf7affdb2b77cb97b54e27a21d7"
    },
    {
      "filename": "pre-0031.jpg",
      "relative_to_capture_ms": -768.8797920000007,
      "sha256": "559662515e6b043a437b5e3b8c2c7d586c770f2223cf2a87b332f7cbf53bcab2"
    },
    {
      "filename": "pre-0032.jpg",
      "relative_to_capture_ms": -697.5422920000005,
      "sha256": "76303d155d38107686802ccd1462cd022235666bed0acab4235f56af30d1dd07"
    },
    {
      "filename": "pre-0033.jpg",
      "relative_to_capture_ms": -628.4892920000002,
      "sha256": "b12421195156a5326b1c800fc4a490d24e9344956c39e04dc0687502615b7e98"
    },
    {
      "filename": "pre-0034.jpg",
      "relative_to_capture_ms": -558.6156670000006,
      "sha256": "8ca810c85fc00ca9c4235ead6e9d3bd99a55ece232daa831b6d7e0ed06effaa1"
    },
    {
      "filename": "pre-0035.jpg",
      "relative_to_capture_ms": -489.4850000000002,
      "sha256": "260bcb5cf11933cf05501f3b662bc5ee43059097de167299c297a1daf861ce0b"
    },
    {
      "filename": "pre-0036.jpg",
      "relative_to_capture_ms": -417.462167,
      "sha256": "c3f7f7d048163d0edcf42f757dd66c2877d1bce876db378e1091218dff918cdd"
    },
    {
      "filename": "pre-0037.jpg",
      "relative_to_capture_ms": -346.83708300000046,
      "sha256": "322f491cdb93d012729cfd7831fb68a5b440cdadfb87719decf37f4d9d8bd7ec"
    },
    {
      "filename": "pre-0038.jpg",
      "relative_to_capture_ms": -275.05316700000026,
      "sha256": "f738fd250cc5dc0d7895ab0eeee2a2cda0d9e6995a70566b5f49e4b027431223"
    },
    {
      "filename": "pre-0039.jpg",
      "relative_to_capture_ms": -204.02425000000068,
      "sha256": "036b7d0dcb12e590a37c8c5f018418f3e7b6176cfef569d5f4c34ccd795322bc"
    },
    {
      "filename": "pre-0040.jpg",
      "relative_to_capture_ms": -135.4624580000001,
      "sha256": "0d77033496601a618680c5f3ba9db4c71aa9bb82f0a392e0b15fb6a7c9c5cd98"
    },
    {
      "filename": "pre-0041.jpg",
      "relative_to_capture_ms": -63.842000000000176,
      "sha256": "1d9de5e7fdb4173e48f5344a33e4425e9b1fa74d9c3ab5b277fb8779e1a2c54a"
    }
  ],
  "pre_only": true
}
```

## probe.json

```json
{
  "camera_ip": "127.0.0.1",
  "recorded_utc": "2026-10-14T09:45:44.615712+00:00",
  "requests": [
    {
      "mode": "getstate",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "cammode": [
            "recmode"
          ]
        }
      },
      "type": null
    },
    {
      "mode": "getinfo",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "model": [
            "MOCK-DC-S5"
          ]
        }
      },
      "type": "capability"
    },
    {
      "mode": "getinfo",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "model": [
            "MOCK-DC-S5"
          ]
        }
      },
      "type": "allmenu"
    },
    {
      "mode": "getinfo",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "model": [
            "MOCK-DC-S5"
          ]
        }
      },
      "type": "curmenu"
    },
    {
      "mode": "getinfo",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "model": [
            "MOCK-DC-S5"
          ]
        }
      },
      "type": "lens"
    },
    {
      "mode": "getsetting",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "iso": [
            "fixture"
          ]
        }
      },
      "type": "iso"
    },
    {
      "mode": "getsetting",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "focal": [
            "fixture"
          ]
        }
      },
      "type": "focal"
    },
    {
      "mode": "getsetting",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "shtrspeed": [
            "fixture"
          ]
        }
      },
      "type": "shtrspeed"
    },
    {
      "mode": "getsetting",
      "reply": {
        "format": "xml",
        "ok": true,
        "result": "ok",
        "values": {
          "liveviewsize": [
            "fixture"
          ]
        }
      },
      "type": "liveviewsize"
    }
  ]
}
```

## shoot-liveview.json

```json
{
  "all_measured_windows_passed": true,
  "camera_ip": "127.0.0.1",
  "complete_fps": 14.198545473448847,
  "complete_frames": 74,
  "dimensions": [
    {
      "frames": 75,
      "height": 48,
      "width": 64
    }
  ],
  "dropped_partial_frames": 0,
  "duration_seconds": 5.211801458,
  "errors": [],
  "foreign_packets_ignored": 0,
  "framing": "datagram",
  "invalid_datagrams": 0,
  "last_3s_gate": {
    "complete_frames": 42,
    "full_window": true,
    "last_frame_age_ms": 61.09479099999948,
    "max_allowed_gap_ms": 500,
    "max_gap_ms": 72.09445899999966,
    "passed": true,
    "target_unique_fps": 10,
    "unique_fps": 14.0,
    "unique_frames": 42,
    "window_seconds": 3.0
  },
  "last_frame_age_ms": 61.09479099999948,
  "loss_rate": null,
  "loss_rate_note": "No known S5 sequence format; packet/frame loss rate not inferred",
  "max_gap_ms": 72.09445899999966,
  "packet_sizes": {
    "361": 1,
    "362": 74
  },
  "pending_partial_bytes": 0,
  "recorded_utc": "2026-10-14T09:45:55.477615+00:00",
  "rolling_3s_windows": [
    {
      "complete_frames": 43,
      "full_window": true,
      "last_frame_age_ms": 36.65883300000017,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.00125000000001,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.333333333333334,
      "unique_frames": 43,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 38.561917,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.00125000000001,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 47.372792,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.09445899999966,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 54.95979200000001,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.09445899999966,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 60.186124999999535,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.09445899999966,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    }
  ],
  "udp_port": 61255,
  "unique_fps": 14.198545473448847,
  "unique_frames": 74,
  "validation": "JPEG marker/SOF/SOS envelope; entropy decoding is not performed"
}
```

## shoot.json

```json
{
  "camera_ip": "127.0.0.1",
  "capture_dispatch_monotonic": 5.183038833,
  "capture_dispatches": 1,
  "capture_reply": {
    "format": "xml",
    "ok": true,
    "result": "ok",
    "values": {}
  },
  "capture_reply_monotonic": 5.186363208,
  "capture_utc": "2026-10-14T09:45:55.253928+00:00",
  "catalog_read_errors": [],
  "download": {
    "dimensions": {
      "height": 384,
      "width": 512
    },
    "exif": {
      "datetime": "2026:10:14 12:00:00",
      "datetime_original": "2026:10:14 12:00:00",
      "make": "FieldFixture",
      "model": "MOCK-DC-S5",
      "orientation": 1
    },
    "path": "s5-field-runs/mock-20261014-174543-858084/phone-original.jpg",
    "sha256": "fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409",
    "size": 2252
  },
  "download_complete_monotonic": 5.636444708,
  "freeze_monotonic": 5.182935458,
  "item_first_seen_monotonic": 5.418804,
  "liveview": {
    "all_measured_windows_passed": true,
    "camera_ip": "127.0.0.1",
    "complete_fps": 14.198545473448847,
    "complete_frames": 74,
    "dimensions": [
      {
        "frames": 75,
        "height": 48,
        "width": 64
      }
    ],
    "dropped_partial_frames": 0,
    "duration_seconds": 5.211801458,
    "errors": [],
    "foreign_packets_ignored": 0,
    "framing": "datagram",
    "invalid_datagrams": 0,
    "last_3s_gate": {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 61.09479099999948,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.09445899999966,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    "last_frame_age_ms": 61.09479099999948,
    "loss_rate": null,
    "loss_rate_note": "No known S5 sequence format; packet/frame loss rate not inferred",
    "max_gap_ms": 72.09445899999966,
    "packet_sizes": {
      "361": 1,
      "362": 74
    },
    "pending_partial_bytes": 0,
    "recorded_utc": "2026-10-14T09:45:55.477615+00:00",
    "rolling_3s_windows": [
      {
        "complete_frames": 43,
        "full_window": true,
        "last_frame_age_ms": 36.65883300000017,
        "max_allowed_gap_ms": 500,
        "max_gap_ms": 72.00125000000001,
        "passed": true,
        "target_unique_fps": 10,
        "unique_fps": 14.333333333333334,
        "unique_frames": 43,
        "window_seconds": 3.0
      },
      {
        "complete_frames": 42,
        "full_window": true,
        "last_frame_age_ms": 38.561917,
        "max_allowed_gap_ms": 500,
        "max_gap_ms": 72.00125000000001,
        "passed": true,
        "target_unique_fps": 10,
        "unique_fps": 14.0,
        "unique_frames": 42,
        "window_seconds": 3.0
      },
      {
        "complete_frames": 42,
        "full_window": true,
        "last_frame_age_ms": 47.372792,
        "max_allowed_gap_ms": 500,
        "max_gap_ms": 72.09445899999966,
        "passed": true,
        "target_unique_fps": 10,
        "unique_fps": 14.0,
        "unique_frames": 42,
        "window_seconds": 3.0
      },
      {
        "complete_frames": 42,
        "full_window": true,
        "last_frame_age_ms": 54.95979200000001,
        "max_allowed_gap_ms": 500,
        "max_gap_ms": 72.09445899999966,
        "passed": true,
        "target_unique_fps": 10,
        "unique_fps": 14.0,
        "unique_frames": 42,
        "window_seconds": 3.0
      },
      {
        "complete_frames": 42,
        "full_window": true,
        "last_frame_age_ms": 60.186124999999535,
        "max_allowed_gap_ms": 500,
        "max_gap_ms": 72.09445899999966,
        "passed": true,
        "target_unique_fps": 10,
        "unique_fps": 14.0,
        "unique_frames": 42,
        "window_seconds": 3.0
      }
    ],
    "udp_port": 61255,
    "unique_fps": 14.198545473448847,
    "unique_frames": 74,
    "validation": "JPEG marker/SOF/SOS envelope; entropy decoding is not performed"
  },
  "new_item": {
    "id": "fixture-0001",
    "kind": "item",
    "parent_id": "0",
    "resources": [
      {
        "attributes": {
          "PANASONIC.COM_PN": "CAM_LRGTN"
        },
        "flag": "CAM_LRGTN",
        "mime": "image/jpeg",
        "original_filename": null,
        "protocolInfo": "http-get:*:image/jpeg:PANASONIC.COM_PN=CAM_LRGTN",
        "resolution": null,
        "size": 500,
        "transport": "http-get",
        "url": "http://127.0.0.1:65394/thumb/fixture-0001.JPG"
      },
      {
        "attributes": {
          "OriginalFileName": "fixture-0001.JPG",
          "PANASONIC.COM_PN": "CAM_ORG"
        },
        "flag": "CAM_ORG",
        "mime": "application/octet-stream",
        "original_filename": "fixture-0001.JPG",
        "protocolInfo": "http-get:*:application/octet-stream;PANASONIC.COM_PN=CAM_ORG;OriginalFileName='fixture-0001.JPG'",
        "resolution": "512x384",
        "size": 2252,
        "transport": "http-get",
        "url": "http://127.0.0.1:65394/original/fixture-0001.JPG"
      }
    ],
    "slot": null,
    "title": "fixture-0001.JPG"
  },
  "prebuffer": {
    "complete_fps": 14.189918063216084,
    "complete_frames": 71,
    "duration_seconds": 5.0035525000000005,
    "last_3s_gate": {
      "complete_frames": 42,
      "full_window": true,
      "last_frame_age_ms": 63.73862500000005,
      "max_allowed_gap_ms": 500,
      "max_gap_ms": 72.09445899999966,
      "passed": true,
      "target_unique_fps": 10,
      "unique_fps": 14.0,
      "unique_frames": 42,
      "window_seconds": 3.0
    },
    "last_frame_age_ms": 63.73862500000005,
    "max_gap_ms": 72.09445899999966,
    "unique_fps": 14.189918063216084,
    "unique_frames": 71
  },
  "prebuffer_frames_saved": 42,
  "recorded_utc": "2026-10-14T09:45:55.719858+00:00",
  "status": "unique original candidate downloaded; SD comparison required"
}
```

## verify.json

```json
{
  "comparisons": {
    "dimensions": true,
    "exif": true,
    "sha256": true,
    "size": true
  },
  "passed": true,
  "phone": {
    "dimensions": {
      "height": 384,
      "width": 512
    },
    "exif": {
      "datetime": "2026:10:14 12:00:00",
      "datetime_original": "2026:10:14 12:00:00",
      "make": "FieldFixture",
      "model": "MOCK-DC-S5",
      "orientation": 1
    },
    "path": "s5-field-runs/mock-20261014-174543-858084/phone-original.jpg",
    "sha256": "fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409",
    "size": 2252
  },
  "recorded_utc": "2026-10-14T09:45:55.898082+00:00",
  "sd": {
    "dimensions": {
      "height": 384,
      "width": 512
    },
    "exif": {
      "datetime": "2026:10:14 12:00:00",
      "datetime_original": "2026:10:14 12:00:00",
      "make": "FieldFixture",
      "model": "MOCK-DC-S5",
      "orientation": 1
    },
    "path": "s5-field-runs/mock-20261014-174543-858084/sd-copy.jpg",
    "sha256": "fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409",
    "size": 2252
  }
}
```
