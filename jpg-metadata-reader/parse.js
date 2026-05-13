// JPEG metadata parser — segment walker + EXIF / GPS / XMP / IPTC / ICC.
// Exposes a single global: window.MetaParser = { parseJpeg(arrayBuffer) }.

(function () {
  'use strict';

  // ── JPEG marker names ───────────────────────────────────────────────────────
  const MARKER_NAMES = {
    0xC0: 'SOF0 (Baseline DCT)',
    0xC1: 'SOF1 (Extended sequential DCT)',
    0xC2: 'SOF2 (Progressive DCT)',
    0xC3: 'SOF3 (Lossless sequential)',
    0xC4: 'DHT (Define Huffman Table)',
    0xC5: 'SOF5 (Differential sequential DCT)',
    0xC6: 'SOF6 (Differential progressive DCT)',
    0xC7: 'SOF7 (Differential lossless)',
    0xC8: 'JPG (Reserved)',
    0xC9: 'SOF9 (Extended sequential DCT, arithmetic)',
    0xCA: 'SOF10 (Progressive DCT, arithmetic)',
    0xCB: 'SOF11 (Lossless, arithmetic)',
    0xCC: 'DAC (Define Arithmetic Coding)',
    0xCD: 'SOF13 (Differential sequential DCT, arithmetic)',
    0xCE: 'SOF14 (Differential progressive DCT, arithmetic)',
    0xCF: 'SOF15 (Differential lossless, arithmetic)',
    0xD8: 'SOI (Start of Image)',
    0xD9: 'EOI (End of Image)',
    0xDA: 'SOS (Start of Scan)',
    0xDB: 'DQT (Define Quantization Table)',
    0xDC: 'DNL (Define Number of Lines)',
    0xDD: 'DRI (Define Restart Interval)',
    0xDE: 'DHP (Define Hierarchical Progression)',
    0xDF: 'EXP (Expand Reference Component)',
    0xE0: 'APP0 (JFIF)',
    0xE1: 'APP1 (EXIF/XMP)',
    0xE2: 'APP2 (ICC/FlashPix)',
    0xE3: 'APP3',
    0xE4: 'APP4',
    0xE5: 'APP5',
    0xE6: 'APP6',
    0xE7: 'APP7',
    0xE8: 'APP8',
    0xE9: 'APP9',
    0xEA: 'APP10',
    0xEB: 'APP11',
    0xEC: 'APP12 (Picture Info)',
    0xED: 'APP13 (Photoshop/IPTC)',
    0xEE: 'APP14 (Adobe)',
    0xEF: 'APP15',
    0xFE: 'COM (Comment)',
  };

  // ── EXIF tag dictionaries ───────────────────────────────────────────────────
  // Tag -> [name, optional enum map]
  const TIFF_TAGS = {
    0x0100: ['ImageWidth'],
    0x0101: ['ImageLength'],
    0x0102: ['BitsPerSample'],
    0x0103: ['Compression', { 1: 'Uncompressed', 6: 'JPEG (old)', 7: 'JPEG' }],
    0x0106: ['PhotometricInterpretation'],
    0x010E: ['ImageDescription'],
    0x010F: ['Make'],
    0x0110: ['Model'],
    0x0111: ['StripOffsets'],
    0x0112: ['Orientation', {
      1: 'Horizontal (normal)', 2: 'Mirrored', 3: 'Rotated 180°',
      4: 'Mirrored, rotated 180°', 5: 'Mirrored, rotated 90° CW',
      6: 'Rotated 90° CW', 7: 'Mirrored, rotated 90° CCW', 8: 'Rotated 90° CCW',
    }],
    0x0115: ['SamplesPerPixel'],
    0x0116: ['RowsPerStrip'],
    0x0117: ['StripByteCounts'],
    0x011A: ['XResolution'],
    0x011B: ['YResolution'],
    0x011C: ['PlanarConfiguration', { 1: 'Chunky', 2: 'Planar' }],
    0x0128: ['ResolutionUnit', { 1: 'None', 2: 'inches', 3: 'cm' }],
    0x012D: ['TransferFunction'],
    0x0131: ['Software'],
    0x0132: ['DateTime'],
    0x013B: ['Artist'],
    0x013E: ['WhitePoint'],
    0x013F: ['PrimaryChromaticities'],
    0x0201: ['JPEGInterchangeFormat'],
    0x0202: ['JPEGInterchangeFormatLength'],
    0x0211: ['YCbCrCoefficients'],
    0x0212: ['YCbCrSubSampling'],
    0x0213: ['YCbCrPositioning', { 1: 'Centered', 2: 'Co-sited' }],
    0x0214: ['ReferenceBlackWhite'],
    0x8298: ['Copyright'],
    0x8769: ['ExifIFDPointer'],
    0x8825: ['GPSInfoIFDPointer'],
  };

  const EXIF_TAGS = {
    0x829A: ['ExposureTime', null, 'sec'],
    0x829D: ['FNumber'],
    0x8822: ['ExposureProgram', {
      0: 'Not defined', 1: 'Manual', 2: 'Normal program', 3: 'Aperture priority',
      4: 'Shutter priority', 5: 'Creative program', 6: 'Action program',
      7: 'Portrait mode', 8: 'Landscape mode',
    }],
    0x8824: ['SpectralSensitivity'],
    0x8827: ['ISOSpeedRatings'],
    0x8828: ['OECF'],
    0x8830: ['SensitivityType', {
      0: 'Unknown', 1: 'SOS', 2: 'REI', 3: 'ISO speed',
      4: 'SOS and REI', 5: 'SOS and ISO speed', 6: 'REI and ISO speed',
      7: 'SOS, REI, and ISO speed',
    }],
    0x8831: ['StandardOutputSensitivity'],
    0x8832: ['RecommendedExposureIndex'],
    0x8833: ['ISOSpeed'],
    0x8834: ['ISOSpeedLatitudeyyy'],
    0x8835: ['ISOSpeedLatitudezzz'],
    0x9000: ['ExifVersion'],
    0x9003: ['DateTimeOriginal'],
    0x9004: ['DateTimeDigitized'],
    0x9010: ['OffsetTime'],
    0x9011: ['OffsetTimeOriginal'],
    0x9012: ['OffsetTimeDigitized'],
    0x9101: ['ComponentsConfiguration'],
    0x9102: ['CompressedBitsPerPixel'],
    0x9201: ['ShutterSpeedValue'],
    0x9202: ['ApertureValue'],
    0x9203: ['BrightnessValue'],
    0x9204: ['ExposureBiasValue', null, 'EV'],
    0x9205: ['MaxApertureValue'],
    0x9206: ['SubjectDistance', null, 'm'],
    0x9207: ['MeteringMode', {
      0: 'Unknown', 1: 'Average', 2: 'Center-weighted average', 3: 'Spot',
      4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other',
    }],
    0x9208: ['LightSource', {
      0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten',
      4: 'Flash', 9: 'Fine weather', 10: 'Cloudy weather', 11: 'Shade',
      12: 'Daylight fluorescent', 13: 'Day-white fluorescent',
      14: 'Cool-white fluorescent', 15: 'White fluorescent',
      17: 'Standard light A', 18: 'Standard light B', 19: 'Standard light C',
      20: 'D55', 21: 'D65', 22: 'D75', 23: 'D50', 24: 'ISO studio tungsten',
      255: 'Other',
    }],
    0x9209: ['Flash'],
    0x920A: ['FocalLength', null, 'mm'],
    0x9214: ['SubjectArea'],
    0x927C: ['MakerNote'],
    0x9286: ['UserComment'],
    0x9290: ['SubsecTime'],
    0x9291: ['SubsecTimeOriginal'],
    0x9292: ['SubsecTimeDigitized'],
    0xA000: ['FlashpixVersion'],
    0xA001: ['ColorSpace', { 1: 'sRGB', 0xFFFF: 'Uncalibrated' }],
    0xA002: ['PixelXDimension'],
    0xA003: ['PixelYDimension'],
    0xA004: ['RelatedSoundFile'],
    0xA005: ['InteroperabilityIFDPointer'],
    0xA20B: ['FlashEnergy'],
    0xA20C: ['SpatialFrequencyResponse'],
    0xA20E: ['FocalPlaneXResolution'],
    0xA20F: ['FocalPlaneYResolution'],
    0xA210: ['FocalPlaneResolutionUnit', { 1: 'None', 2: 'inches', 3: 'cm' }],
    0xA214: ['SubjectLocation'],
    0xA215: ['ExposureIndex'],
    0xA217: ['SensingMethod', {
      1: 'Not defined', 2: 'One-chip color area', 3: 'Two-chip color area',
      4: 'Three-chip color area', 5: 'Color sequential area',
      7: 'Trilinear', 8: 'Color sequential linear',
    }],
    0xA300: ['FileSource'],
    0xA301: ['SceneType'],
    0xA302: ['CFAPattern'],
    0xA401: ['CustomRendered', { 0: 'Normal', 1: 'Custom' }],
    0xA402: ['ExposureMode', { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' }],
    0xA403: ['WhiteBalance', { 0: 'Auto', 1: 'Manual' }],
    0xA404: ['DigitalZoomRatio'],
    0xA405: ['FocalLengthIn35mmFilm', null, 'mm'],
    0xA406: ['SceneCaptureType', {
      0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night scene',
    }],
    0xA407: ['GainControl', {
      0: 'None', 1: 'Low gain up', 2: 'High gain up',
      3: 'Low gain down', 4: 'High gain down',
    }],
    0xA408: ['Contrast', { 0: 'Normal', 1: 'Soft', 2: 'Hard' }],
    0xA409: ['Saturation', { 0: 'Normal', 1: 'Low', 2: 'High' }],
    0xA40A: ['Sharpness', { 0: 'Normal', 1: 'Soft', 2: 'Hard' }],
    0xA40B: ['DeviceSettingDescription'],
    0xA40C: ['SubjectDistanceRange', {
      0: 'Unknown', 1: 'Macro', 2: 'Close view', 3: 'Distant view',
    }],
    0xA420: ['ImageUniqueID'],
    0xA430: ['CameraOwnerName'],
    0xA431: ['BodySerialNumber'],
    0xA432: ['LensSpecification'],
    0xA433: ['LensMake'],
    0xA434: ['LensModel'],
    0xA435: ['LensSerialNumber'],
    0xA460: ['CompositeImage'],
  };

  const GPS_TAGS = {
    0x0000: ['GPSVersionID'],
    0x0001: ['GPSLatitudeRef'],
    0x0002: ['GPSLatitude'],
    0x0003: ['GPSLongitudeRef'],
    0x0004: ['GPSLongitude'],
    0x0005: ['GPSAltitudeRef', { 0: 'Above sea level', 1: 'Below sea level' }],
    0x0006: ['GPSAltitude'],
    0x0007: ['GPSTimeStamp'],
    0x0008: ['GPSSatellites'],
    0x0009: ['GPSStatus'],
    0x000A: ['GPSMeasureMode'],
    0x000B: ['GPSDOP'],
    0x000C: ['GPSSpeedRef'],
    0x000D: ['GPSSpeed'],
    0x000E: ['GPSTrackRef'],
    0x000F: ['GPSTrack'],
    0x0010: ['GPSImgDirectionRef'],
    0x0011: ['GPSImgDirection'],
    0x0012: ['GPSMapDatum'],
    0x0013: ['GPSDestLatitudeRef'],
    0x0014: ['GPSDestLatitude'],
    0x0015: ['GPSDestLongitudeRef'],
    0x0016: ['GPSDestLongitude'],
    0x0017: ['GPSDestBearingRef'],
    0x0018: ['GPSDestBearing'],
    0x0019: ['GPSDestDistanceRef'],
    0x001A: ['GPSDestDistance'],
    0x001B: ['GPSProcessingMethod'],
    0x001C: ['GPSAreaInformation'],
    0x001D: ['GPSDateStamp'],
    0x001E: ['GPSDifferential'],
    0x001F: ['GPSHPositioningError'],
  };

  const INTEROP_TAGS = {
    0x0001: ['InteroperabilityIndex'],
    0x0002: ['InteroperabilityVersion'],
    0x1000: ['RelatedImageFileFormat'],
    0x1001: ['RelatedImageWidth'],
    0x1002: ['RelatedImageLength'],
  };

  // ── IPTC dataset names (subset of IIM v4) ───────────────────────────────────
  const IPTC_TAGS = {
    '1:90': 'CodedCharacterSet',
    '2:0':  'RecordVersion',
    '2:3':  'ObjectTypeReference',
    '2:5':  'ObjectName',
    '2:7':  'EditStatus',
    '2:10': 'Urgency',
    '2:12': 'SubjectReference',
    '2:15': 'Category',
    '2:20': 'SupplementalCategories',
    '2:22': 'FixtureIdentifier',
    '2:25': 'Keywords',
    '2:26': 'ContentLocationCode',
    '2:27': 'ContentLocationName',
    '2:30': 'ReleaseDate',
    '2:35': 'ReleaseTime',
    '2:37': 'ExpirationDate',
    '2:38': 'ExpirationTime',
    '2:40': 'SpecialInstructions',
    '2:45': 'ReferenceService',
    '2:47': 'ReferenceDate',
    '2:50': 'ReferenceNumber',
    '2:55': 'DateCreated',
    '2:60': 'TimeCreated',
    '2:62': 'DigitalCreationDate',
    '2:63': 'DigitalCreationTime',
    '2:65': 'OriginatingProgram',
    '2:70': 'ProgramVersion',
    '2:75': 'ObjectCycle',
    '2:80': 'Byline',
    '2:85': 'BylineTitle',
    '2:90': 'City',
    '2:92': 'Sublocation',
    '2:95': 'ProvinceState',
    '2:100': 'CountryPrimaryLocationCode',
    '2:101': 'CountryPrimaryLocationName',
    '2:103': 'OriginalTransmissionReference',
    '2:105': 'Headline',
    '2:110': 'Credit',
    '2:115': 'Source',
    '2:116': 'CopyrightNotice',
    '2:118': 'Contact',
    '2:120': 'CaptionAbstract',
    '2:122': 'WriterEditor',
    '2:130': 'ImageType',
    '2:131': 'ImageOrientation',
    '2:135': 'LanguageIdentifier',
  };

  const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

  // ── Public entry ────────────────────────────────────────────────────────────
  function parseJpeg(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) {
      throw new Error('Not a JPEG: missing SOI marker (0xFFD8).');
    }

    const segments = [];
    const result = {
      segments,
      jfif: null,
      sof: null,
      comments: [],
      exif: null,
      gps: null,
      interop: null,
      ifd1: null,
      xmp: null,
      iptc: null,
      icc: null,
      adobe: null,
    };

    let offset = 2; // past SOI
    while (offset < view.byteLength) {
      if (view.getUint8(offset) !== 0xFF) break;
      // Skip filler 0xFF bytes
      while (offset < view.byteLength && view.getUint8(offset) === 0xFF) offset++;
      if (offset >= view.byteLength) break;
      const marker = view.getUint8(offset);
      offset++;

      // Markers without payload
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
        segments.push({ marker, offset: offset - 2, length: 0, name: MARKER_NAMES[marker] || `Marker 0x${marker.toString(16)}` });
        if (marker === 0xD9) break;
        continue;
      }

      if (offset + 2 > view.byteLength) break;
      const length = view.getUint16(offset);
      const dataStart = offset + 2;
      const dataEnd = offset + length;
      if (dataEnd > view.byteLength) break;
      const segOffset = offset - 2;
      segments.push({
        marker,
        offset: segOffset,
        length,
        name: MARKER_NAMES[marker] || `Marker 0x${marker.toString(16)}`,
      });

      try {
        dispatchSegment(marker, view, dataStart, dataEnd, result);
      } catch (e) {
        // Continue parsing even if one segment fails
        console.warn('Segment parse failed:', e);
      }

      // SOS marks the start of the compressed stream — stop walking.
      if (marker === 0xDA) break;
      offset = dataEnd;
    }

    return result;
  }

  function dispatchSegment(marker, view, start, end, result) {
    const len = end - start;
    if (marker === 0xE0) {
      result.jfif = parseJfif(view, start, end) || result.jfif;
    } else if (marker === 0xE1) {
      // Either EXIF ("Exif\0\0") or XMP ("http://ns.adobe.com/xap/1.0/\0")
      if (len >= 6 && readAscii(view, start, 4) === 'Exif' &&
          view.getUint8(start + 4) === 0 && view.getUint8(start + 5) === 0) {
        parseExif(view, start + 6, end, result);
      } else if (len > 29) {
        const hdr = readAscii(view, start, 28);
        if (hdr.startsWith('http://ns.adobe.com/xap/1.0/')) {
          result.xmp = readUtf8(view, start + 29, end);
        }
      }
    } else if (marker === 0xE2) {
      // ICC profile
      if (len > 14 && readAscii(view, start, 11) === 'ICC_PROFILE') {
        const seqNo = view.getUint8(start + 12);
        const total = view.getUint8(start + 13);
        const chunk = new Uint8Array(view.buffer, view.byteOffset + start + 14, end - start - 14);
        result.icc = result.icc || { chunks: new Map(), total };
        result.icc.chunks.set(seqNo, chunk);
        result.icc.total = total;
      }
    } else if (marker === 0xED) {
      // Photoshop / IPTC
      if (len > 14 && readAscii(view, start, 13) === 'Photoshop 3.0') {
        result.iptc = parsePhotoshopIrb(view, start + 14, end) || result.iptc;
      }
    } else if (marker === 0xEE) {
      // Adobe APP14
      if (len >= 12 && readAscii(view, start, 5) === 'Adobe') {
        const version = view.getUint16(start + 5);
        const flags0  = view.getUint16(start + 7);
        const flags1  = view.getUint16(start + 9);
        const colorTransform = view.getUint8(start + 11);
        const xform = { 0: 'Unknown (RGB or CMYK)', 1: 'YCbCr', 2: 'YCCK' }[colorTransform] || `0x${colorTransform.toString(16)}`;
        result.adobe = { version, flags0, flags1, colorTransform: xform };
      }
    } else if (marker === 0xFE) {
      result.comments.push(readUtf8(view, start, end));
    } else if (marker >= 0xC0 && marker <= 0xC3 || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      // Start of Frame — frame dimensions and component info
      if (len >= 6 && !result.sof) {
        const precision = view.getUint8(start);
        const height = view.getUint16(start + 1);
        const width = view.getUint16(start + 3);
        const components = view.getUint8(start + 5);
        result.sof = { marker, precision, width, height, components };
      }
    }
  }

  // ── JFIF ────────────────────────────────────────────────────────────────────
  function parseJfif(view, start, end) {
    if (end - start < 9) return null;
    if (readAscii(view, start, 4) !== 'JFIF' || view.getUint8(start + 4) !== 0) return null;
    const versionMajor = view.getUint8(start + 5);
    const versionMinor = view.getUint8(start + 6);
    const units = view.getUint8(start + 7);
    const xDensity = view.getUint16(start + 8);
    const yDensity = view.getUint16(start + 10);
    return {
      version: `${versionMajor}.${String(versionMinor).padStart(2, '0')}`,
      units: { 0: 'Aspect ratio', 1: 'DPI', 2: 'DPCM' }[units] || `Unknown (${units})`,
      xDensity,
      yDensity,
    };
  }

  // ── EXIF / TIFF ─────────────────────────────────────────────────────────────
  function parseExif(view, tiffStart, end, result) {
    const b0 = view.getUint8(tiffStart);
    const b1 = view.getUint8(tiffStart + 1);
    let little;
    if (b0 === 0x49 && b1 === 0x49) little = true;
    else if (b0 === 0x4D && b1 === 0x4D) little = false;
    else return;

    const magic = view.getUint16(tiffStart + 2, little);
    if (magic !== 0x002A) return;

    const ifd0Offset = view.getUint32(tiffStart + 4, little);
    const ifd0 = parseIfd(view, tiffStart, tiffStart + ifd0Offset, little, TIFF_TAGS, end);
    result.exif = { entries: ifd0.entries };

    // Sub-IFDs
    const exifPtr = pickPointer(ifd0.entries, 'ExifIFDPointer');
    if (exifPtr != null) {
      const sub = parseIfd(view, tiffStart, tiffStart + exifPtr, little, EXIF_TAGS, end);
      result.exif.sub = sub.entries;
      const interopPtr = pickPointer(sub.entries, 'InteroperabilityIFDPointer');
      if (interopPtr != null) {
        const interop = parseIfd(view, tiffStart, tiffStart + interopPtr, little, INTEROP_TAGS, end);
        result.interop = interop.entries;
      }
    }

    const gpsPtr = pickPointer(ifd0.entries, 'GPSInfoIFDPointer');
    if (gpsPtr != null) {
      const gps = parseIfd(view, tiffStart, tiffStart + gpsPtr, little, GPS_TAGS, end);
      result.gps = { entries: gps.entries };
      const dec = decodeGps(gps.entries);
      if (dec) result.gps.decoded = dec;
    }

    if (ifd0.nextIfdOffset) {
      const ifd1 = parseIfd(view, tiffStart, tiffStart + ifd0.nextIfdOffset, little, TIFF_TAGS, end);
      result.ifd1 = { entries: ifd1.entries };
      // Try to extract embedded thumbnail
      const offsetEntry = ifd1.entries.find(e => e.name === 'JPEGInterchangeFormat');
      const sizeEntry   = ifd1.entries.find(e => e.name === 'JPEGInterchangeFormatLength');
      if (offsetEntry && sizeEntry) {
        const thOff  = scalar(offsetEntry.raw);
        const thSize = scalar(sizeEntry.raw);
        const absStart = tiffStart + thOff;
        const absEnd = absStart + thSize;
        if (thSize > 0 && absEnd <= view.byteLength) {
          result.ifd1.thumbnail = new Uint8Array(view.buffer, view.byteOffset + absStart, thSize);
        }
      }
    }
  }

  function parseIfd(view, tiffStart, ifdStart, little, tagDict, fileEnd) {
    const entries = [];
    if (ifdStart + 2 > view.byteLength) return { entries, nextIfdOffset: 0 };
    const count = view.getUint16(ifdStart, little);
    let cursor = ifdStart + 2;
    for (let i = 0; i < count; i++) {
      if (cursor + 12 > view.byteLength) break;
      const tag = view.getUint16(cursor, little);
      const type = view.getUint16(cursor + 2, little);
      const n = view.getUint32(cursor + 4, little);
      const valueOffset = cursor + 8;
      const size = (TYPE_SIZES[type] || 0) * n;
      let dataStart;
      if (size <= 4) {
        dataStart = valueOffset;
      } else {
        dataStart = tiffStart + view.getUint32(valueOffset, little);
      }
      let raw;
      if (size > 0 && dataStart + size <= view.byteLength) {
        raw = readValue(view, dataStart, type, n, little);
      } else {
        raw = null;
      }

      const dictEntry = tagDict[tag];
      const name = dictEntry ? dictEntry[0] : null;
      const enumMap = dictEntry ? dictEntry[1] : null;
      const unit = dictEntry ? dictEntry[2] : null;

      entries.push({
        tag,
        tagHex: '0x' + tag.toString(16).toUpperCase().padStart(4, '0'),
        type,
        count: n,
        name,
        raw,
        formatted: formatValue(name, type, raw, enumMap, unit),
      });
      cursor += 12;
    }
    let nextIfdOffset = 0;
    if (cursor + 4 <= view.byteLength) {
      nextIfdOffset = view.getUint32(cursor, little);
    }
    return { entries, nextIfdOffset };
  }

  function readValue(view, offset, type, count, little) {
    switch (type) {
      case 1: { // BYTE
        const out = new Array(count);
        for (let i = 0; i < count; i++) out[i] = view.getUint8(offset + i);
        return out;
      }
      case 2: { // ASCII
        let s = '';
        for (let i = 0; i < count; i++) {
          const c = view.getUint8(offset + i);
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        return s;
      }
      case 3: { // SHORT
        const out = new Array(count);
        for (let i = 0; i < count; i++) out[i] = view.getUint16(offset + i * 2, little);
        return out;
      }
      case 4: { // LONG
        const out = new Array(count);
        for (let i = 0; i < count; i++) out[i] = view.getUint32(offset + i * 4, little);
        return out;
      }
      case 5: { // RATIONAL
        const out = new Array(count);
        for (let i = 0; i < count; i++) {
          out[i] = [
            view.getUint32(offset + i * 8, little),
            view.getUint32(offset + i * 8 + 4, little),
          ];
        }
        return out;
      }
      case 7: { // UNDEFINED
        const out = new Uint8Array(count);
        for (let i = 0; i < count; i++) out[i] = view.getUint8(offset + i);
        return out;
      }
      case 9: { // SLONG
        const out = new Array(count);
        for (let i = 0; i < count; i++) out[i] = view.getInt32(offset + i * 4, little);
        return out;
      }
      case 10: { // SRATIONAL
        const out = new Array(count);
        for (let i = 0; i < count; i++) {
          out[i] = [
            view.getInt32(offset + i * 8, little),
            view.getInt32(offset + i * 8 + 4, little),
          ];
        }
        return out;
      }
      default:
        return null;
    }
  }

  function scalar(raw) {
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }

  function pickPointer(entries, name) {
    const e = entries.find(x => x.name === name);
    if (!e || !e.raw) return null;
    return scalar(e.raw);
  }

  function rat(r) {
    if (!r || r[1] === 0) return null;
    return r[0] / r[1];
  }

  function formatValue(name, type, raw, enumMap, unit) {
    if (raw == null) return null;
    // Special EXIF-version-style undefined tags: 4 ASCII bytes
    if ((name === 'ExifVersion' || name === 'FlashpixVersion' || name === 'InteroperabilityVersion') && raw instanceof Uint8Array) {
      const s = Array.from(raw).map(c => String.fromCharCode(c)).join('').trim();
      return s.length === 4 ? `${s[0]}${s[1]}.${s[2]}${s[3]}` : s;
    }
    if (name === 'ComponentsConfiguration' && raw instanceof Uint8Array) {
      const map = { 0: '-', 1: 'Y', 2: 'Cb', 3: 'Cr', 4: 'R', 5: 'G', 6: 'B' };
      return Array.from(raw).map(b => map[b] || b).join('');
    }
    if (name === 'UserComment' && raw instanceof Uint8Array) {
      return decodeUserComment(raw);
    }
    if (name === 'GPSVersionID' && Array.isArray(raw)) {
      return raw.join('.');
    }
    if (name === 'Flash' && Array.isArray(raw)) {
      return formatFlash(raw[0]);
    }
    if (name === 'ExposureTime' && Array.isArray(raw) && raw[0]) {
      const [n, d] = raw[0];
      if (!d) return null;
      const v = n / d;
      const text = v >= 1 ? `${v.toFixed(1)}` : `1/${Math.round(d / n)}`;
      return `${text}${unit ? ' ' + unit : ''}`;
    }
    if (name === 'FNumber' && Array.isArray(raw) && raw[0]) {
      const v = rat(raw[0]);
      if (v == null) return null;
      return `f/${v.toFixed(1)}`;
    }
    if (name === 'FocalLength' && Array.isArray(raw) && raw[0]) {
      const v = rat(raw[0]);
      if (v == null) return null;
      return `${trimNum(v).replace(/\.?0+$/, '')} mm`;
    }
    if (name === 'ExposureBiasValue' && Array.isArray(raw) && raw[0]) {
      const v = rat(raw[0]);
      if (v == null) return null;
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(2)} EV`;
    }
    if (name === 'SubjectDistance' && Array.isArray(raw) && raw[0]) {
      const [n, d] = raw[0];
      if (!d) return null;
      if (n === 0xFFFFFFFF) return 'Infinity';
      return `${(n / d).toFixed(2)} m`;
    }
    if (name === 'ShutterSpeedValue' && Array.isArray(raw) && raw[0]) {
      const v = rat(raw[0]);
      if (v == null) return null;
      const tv = Math.pow(2, v);
      return `${v.toFixed(2)} (≈ 1/${Math.round(tv)} sec)`;
    }
    if (name === 'ApertureValue' && Array.isArray(raw) && raw[0]) {
      const v = rat(raw[0]);
      if (v == null) return null;
      const fn = Math.pow(Math.SQRT2, v);
      return `${v.toFixed(2)} (≈ f/${fn.toFixed(1)})`;
    }
    if (name === 'GPSTimeStamp' && Array.isArray(raw) && raw.length === 3) {
      const [h, m, s] = raw.map(rat);
      if (h == null || m == null || s == null) return null;
      return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(m)).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')} UTC`;
    }
    if (type === 5 || type === 10) {
      // Rationals
      if (Array.isArray(raw)) {
        const formatted = raw.map(([n, d]) => {
          if (!d) return `${n}/0`;
          const v = n / d;
          if (Number.isInteger(v) && Math.abs(v) < 1e6) return `${v}`;
          return `${trimNum(v)} (${n}/${d})`;
        }).join(', ');
        return unit ? `${formatted} ${unit}` : formatted;
      }
    }
    if (type === 7 && raw instanceof Uint8Array) {
      if (raw.length <= 16) {
        return Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(' ');
      }
      return `${raw.length} bytes`;
    }
    if (enumMap && Array.isArray(raw) && raw.length === 1) {
      const v = raw[0];
      const label = enumMap[v];
      return label ? `${label} (${v})` : `${v}`;
    }
    if (Array.isArray(raw)) {
      const joined = raw.join(', ');
      return unit ? `${joined} ${unit}` : joined;
    }
    return String(raw);
  }

  function trimNum(v) {
    if (Math.abs(v) >= 100) return v.toFixed(2);
    if (Math.abs(v) >= 1) return v.toFixed(3);
    return v.toFixed(5);
  }

  function formatFlash(v) {
    if (v == null) return null;
    const fired = !!(v & 0x01);
    const ret = (v >> 1) & 0x03;
    const mode = (v >> 3) & 0x03;
    const noFn = !!(v & 0x20);
    const redEye = !!(v & 0x40);
    const parts = [fired ? 'Fired' : 'Did not fire'];
    if (ret === 2) parts.push('no return');
    if (ret === 3) parts.push('return detected');
    if (mode === 1) parts.push('compulsory on');
    if (mode === 2) parts.push('compulsory off');
    if (mode === 3) parts.push('auto');
    if (noFn) parts.push('no flash function');
    if (redEye) parts.push('red-eye reduction');
    return `${parts.join(', ')} (0x${v.toString(16).padStart(2, '0')})`;
  }

  function decodeUserComment(bytes) {
    if (bytes.length < 8) return bytesToString(bytes);
    const tag = bytesToString(bytes.subarray(0, 8)).replace(/\0/g, '').trim();
    const payload = bytes.subarray(8);
    if (tag.toUpperCase() === 'ASCII') return bytesToString(payload).replace(/\0+$/, '');
    if (tag.toUpperCase() === 'UNICODE') {
      try {
        return new TextDecoder('utf-16').decode(payload).replace(/\0+$/, '');
      } catch { return bytesToString(payload); }
    }
    return bytesToString(bytes).replace(/\0+$/, '');
  }

  function decodeGps(entries) {
    function val(name) {
      const e = entries.find(x => x.name === name);
      return e ? e.raw : null;
    }
    function rats(name) {
      const r = val(name);
      if (!Array.isArray(r) || r.length !== 3) return null;
      return r.map(rat);
    }
    const lat = rats('GPSLatitude');
    const lon = rats('GPSLongitude');
    const latRef = scalar(val('GPSLatitudeRef'));
    const lonRef = scalar(val('GPSLongitudeRef'));
    if (!lat || !lon || !latRef || !lonRef) return null;
    const decimal = (parts, ref) => {
      const d = parts[0] + parts[1] / 60 + parts[2] / 3600;
      return (ref === 'S' || ref === 'W') ? -d : d;
    };
    const latitude = decimal(lat, latRef);
    const longitude = decimal(lon, lonRef);
    let altitude = null;
    const altRaw = val('GPSAltitude');
    if (Array.isArray(altRaw) && altRaw[0]) {
      const a = rat(altRaw[0]);
      const ref = scalar(val('GPSAltitudeRef'));
      altitude = ref === 1 ? -a : a;
    }
    return { latitude, longitude, altitude };
  }

  // ── IPTC / Photoshop IRB ────────────────────────────────────────────────────
  function parsePhotoshopIrb(view, start, end) {
    let cursor = start;
    const result = [];
    while (cursor + 12 <= end) {
      if (readAscii(view, cursor, 4) !== '8BIM') break;
      cursor += 4;
      const id = view.getUint16(cursor); cursor += 2;
      const nameLen = view.getUint8(cursor); cursor += 1;
      const nameBytes = nameLen + (nameLen % 2 === 0 ? 1 : 0); // pad to even
      cursor += nameBytes;
      const size = view.getUint32(cursor); cursor += 4;
      const blockStart = cursor;
      const blockEnd = blockStart + size;
      if (blockEnd > end) break;
      if (id === 0x0404) {
        // IPTC NAA Record (IIM)
        const entries = parseIptcIim(view, blockStart, blockEnd);
        if (entries.length) result.push(...entries);
      }
      cursor = blockEnd + (size % 2); // pad to even
    }
    return result.length ? result : null;
  }

  function parseIptcIim(view, start, end) {
    const entries = [];
    let cursor = start;
    // Track raw bytes per dataset so we can decode after we see CodedCharacterSet.
    const raw = [];
    let charset = null;
    while (cursor + 5 <= end) {
      if (view.getUint8(cursor) !== 0x1C) break;
      const record = view.getUint8(cursor + 1);
      const dataset = view.getUint8(cursor + 2);
      let len = view.getUint16(cursor + 3);
      let dataStart = cursor + 5;
      if (len & 0x8000) {
        // Extended length
        const lenOfLen = len & 0x7FFF;
        len = 0;
        for (let i = 0; i < lenOfLen; i++) {
          len = (len << 8) | view.getUint8(cursor + 5 + i);
        }
        dataStart = cursor + 5 + lenOfLen;
      }
      const dataEnd = dataStart + len;
      if (dataEnd > end) break;
      const bytes = new Uint8Array(view.buffer, view.byteOffset + dataStart, len);
      const key = `${record}:${dataset}`;
      if (key === '1:90') {
        // Coded character set
        const sig = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        if (sig.includes('%G') || sig.includes('\x1B%G')) charset = 'utf-8';
      }
      raw.push({ key, bytes });
      cursor = dataEnd;
    }
    const decoder = new TextDecoder(charset === 'utf-8' ? 'utf-8' : 'latin1');
    for (const { key, bytes } of raw) {
      const name = IPTC_TAGS[key] || key;
      let value;
      if (key === '2:0' && bytes.length === 2) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        value = String(dv.getUint16(0));
      } else {
        value = decoder.decode(bytes);
      }
      entries.push({ key, name, value });
    }
    return entries;
  }

  // ── Small helpers ───────────────────────────────────────────────────────────
  function readAscii(view, start, len) {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(start + i));
    return s;
  }

  function readUtf8(view, start, end) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, end - start);
    try {
      return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '');
    } catch {
      return bytesToString(bytes);
    }
  }

  function bytesToString(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function concatIccChunks(icc) {
    if (!icc) return null;
    const sorted = [...icc.chunks.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    const total = sorted.reduce((acc, c) => acc + c.byteLength, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of sorted) { out.set(c, o); o += c.byteLength; }
    return out;
  }

  function parseIccHeader(bytes) {
    if (!bytes || bytes.length < 128) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = dv.getUint32(0);
    const cmm = readAscii(dv, 4, 4);
    const versionMajor = dv.getUint8(8);
    const versionMinor = (dv.getUint8(9) >> 4) & 0x0F;
    const versionSub   = dv.getUint8(9) & 0x0F;
    const deviceClass  = readAscii(dv, 12, 4);
    const colorSpace   = readAscii(dv, 16, 4);
    const pcs          = readAscii(dv, 20, 4);
    const year   = dv.getUint16(24);
    const month  = dv.getUint16(26);
    const day    = dv.getUint16(28);
    const hour   = dv.getUint16(30);
    const minute = dv.getUint16(32);
    const second = dv.getUint16(34);
    const platform = readAscii(dv, 40, 4);
    const manufacturer = readAscii(dv, 48, 4);
    const model        = readAscii(dv, 52, 4);
    // Try to read 'desc' tag
    const description = readIccDescription(bytes);
    return {
      size,
      cmm: cmm.trim(),
      version: `${versionMajor}.${versionMinor}.${versionSub}`,
      deviceClass: deviceClass.trim(),
      colorSpace: colorSpace.trim(),
      pcs: pcs.trim(),
      created: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
      platform: platform.trim(),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      description,
    };
  }

  function readIccDescription(bytes) {
    if (bytes.length < 132) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tagCount = dv.getUint32(128);
    if (132 + tagCount * 12 > bytes.length) return null;
    for (let i = 0; i < tagCount; i++) {
      const base = 132 + i * 12;
      const sig = readAscii(dv, base, 4);
      const off = dv.getUint32(base + 4);
      const sz  = dv.getUint32(base + 8);
      if (sig === 'desc' && off + sz <= bytes.length) {
        return parseDescTag(bytes.subarray(off, off + sz));
      }
    }
    return null;
  }

  function parseDescTag(bytes) {
    const sig = bytesToString(bytes.subarray(0, 4));
    if (sig === 'desc') {
      // ICC v2 textDescriptionType
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const asciiLen = dv.getUint32(8);
      if (12 + asciiLen <= bytes.length) {
        return bytesToString(bytes.subarray(12, 12 + asciiLen)).replace(/\0+$/, '');
      }
    } else if (sig === 'mluc') {
      // ICC v4 multiLocalizedUnicodeType
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const records = dv.getUint32(8);
      const recSize = dv.getUint32(12);
      if (records > 0 && 16 + recSize <= bytes.length) {
        const len = dv.getUint32(16 + 4 * 2);
        const off = dv.getUint32(16 + 4 * 3);
        if (off + len <= bytes.length) {
          try {
            return new TextDecoder('utf-16be').decode(bytes.subarray(off, off + len));
          } catch { /* ignore */ }
        }
      }
    }
    return null;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Expose
  window.MetaParser = {
    parseJpeg,
    concatIccChunks,
    parseIccHeader,
    MARKER_NAMES,
  };
})();
