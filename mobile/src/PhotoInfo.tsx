import React, {useEffect, useRef, useState} from 'react';
import {Clipboard, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {MomentDetails, MomentItem} from './native';
import {formatBytes, formatDimensions, shortPath} from './albumFormat';
import {lutDisplayName} from './lutName';
import {ui} from './theme';

const PARAM_LABELS = {iso: 'ISO', shutter: '快门', aperture: '光圈', focalLength: '焦距'};

function cameraLine(details: MomentDetails) {
  const camera = details.camera?.replace(/^Panasonic\s+/i, '') || null;
  return [camera, details.lens].filter(Boolean).join(' · ');
}

function InfoRow({label, value, selectable = false, singleLine = false}: {label: string; value: string; selectable?: boolean; singleLine?: boolean}) {
  return <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text selectable={selectable} numberOfLines={singleLine ? 1 : undefined} ellipsizeMode="tail" style={styles.rowValue}>{value}</Text>
  </View>;
}

function Section({title, action, children}: {title: string; action?: React.ReactNode; children: React.ReactNode}) {
  return <View style={styles.section}>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action}</View>
    {children}
  </View>;
}

export default function PhotoInfo({details, moment}: {details: MomentDetails; moment: MomentItem}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {if (timer.current) clearTimeout(timer.current);}, []);
  const copyPath = () => {
    try {
      Clipboard.setString(details.directory);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch { /* Clipboard is optional on some Android builds. */ }
  };

  const params = [
    {key: 'iso', value: details.iso?.replace(/^ISO\s*/i, '')},
    {key: 'shutter', value: details.shutter},
    {key: 'aperture', value: details.aperture},
    {key: 'focalLength', value: details.focalLength},
  ].filter((item): item is {key: keyof typeof PARAM_LABELS; value: string} => !!item.value);
  const hasExif = !!cameraLine(details) || params.length > 0;
  const cameraFile = details.cameraFile || (moment.demo ? '演示素材' : moment.source);
  const dimensions = details.width && details.height ? formatDimensions(details.width, details.height) : '未知';
  const size = details.files.length ? formatBytes(details.files.reduce((sum, file) => sum + file.bytes, 0)) : '未知';
  const library = !details.exportKnown ? '无法确认' : details.exported ? '已导出' : '未导出';

  return <View>
    {hasExif && !!cameraLine(details) && <Text testID="info-camera" numberOfLines={2} style={styles.camera}>{cameraLine(details)}</Text>}
    {params.length > 0 && <View testID="info-params" style={styles.params}>
      {params.map((item) => <View key={item.key} style={styles.param}>
        <Text style={styles.paramLabel}>{PARAM_LABELS[item.key]}</Text>
        <Text numberOfLines={1} style={styles.paramValue}>{item.value}</Text>
      </View>)}
    </View>}
    {!hasExif && <Text testID="info-no-exif" style={styles.noExif}>这张照片没有拍摄参数（EXIF）</Text>}

    <Section title="文件">
      <InfoRow label="机身文件" value={cameraFile || '未知'} selectable/>
      <InfoRow label="尺寸" value={dimensions}/>
      <InfoRow label="大小" value={size}/>
    </Section>

    <Section title="处理">
      <InfoRow label="来源" value={details.origin}/>
      <InfoRow label="连接" value={details.transport === '演示' ? '无（演示画面）' : details.transport}/>
      <InfoRow label="LUT" value={details.lut ? `${lutDisplayName(details.lut)}${details.lutApplied ? '' : '（未成功套用）'}` : '原色'}/>
    </Section>

    <Section title="存储" action={
      <Pressable accessibilityRole="button" accessibilityLabel="复制路径" hitSlop={{top: 4, bottom: 4}} onPress={copyPath} style={({pressed}) => [styles.copy, pressed && styles.copyPressed]}>
        <Text style={[styles.copyText, copied && styles.copiedText]}>{copied ? '已复制' : '复制路径'}</Text>
      </Pressable>
    }>
      <InfoRow label="App 内目录" value={shortPath(details.directory)} selectable singleLine/>
      <InfoRow label="系统相册" value={library}/>
      {!!details.exportPath && <InfoRow label="导出位置" value={details.exportPath} selectable/>}
    </Section>
  </View>;
}

const styles = StyleSheet.create({
  camera: {...ui.type.body, color: ui.color.text, fontWeight: '600', marginBottom: ui.space.sm},
  params: {flexDirection: 'row', gap: ui.space.sm, marginBottom: ui.space.md},
  param: {flex: 1, minWidth: 0, gap: 2, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.sm, borderRadius: ui.radius.small, backgroundColor: ui.color.surface},
  paramLabel: {...ui.type.label, color: ui.color.muted}, paramValue: {...ui.type.body, color: ui.color.text},
  noExif: {...ui.type.body, color: ui.color.text, paddingVertical: ui.space.sm},
  section: {marginTop: ui.space.sm, gap: 2},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.sm},
  sectionTitle: {...ui.type.label, color: ui.color.muted},
  row: {minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: ui.space.sm},
  rowLabel: {...ui.type.caption, color: ui.color.muted, width: 88},
  rowValue: {...ui.type.body, color: ui.color.text, flex: 1, minWidth: 0},
  copy: {height: 40, justifyContent: 'center', paddingHorizontal: ui.space.sm, borderRadius: ui.radius.small, backgroundColor: ui.color.raised},
  copyPressed: {backgroundColor: ui.color.selected}, copyText: {...ui.type.label, color: ui.color.accent}, copiedText: {color: ui.color.text},
});
