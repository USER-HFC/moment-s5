import React, {useMemo} from 'react';
import {PixelRatio} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {ScopeKind, SCOPE_TITLES} from './panelState';
import {ScopeFrame, SCOPE_SHAPE} from './protocol';

const RGB = ['#FF9AA0', '#8BF0B3', '#A8C8FF'];
const INK = '#F2F6EA';
const HALO = '#080C08';
const GRID = '#FFFFFF70';
const DENSITY_STEPS = 6;
// The analyzer grid is 128 levels tall but the plot is 120 units; abutting antialiased
// row edges leave horizontal scanlines at that sub-unit scale, so rows overlap slightly.
export const DENSITY_ROW_HEIGHT = 1.06;
const AXIS_MIN_DP = 10;
const AXIS_MAX_DP = 18;
const AXIS_REFERENCE_WIDTH = 184;
const AXIS_MAX_FONT_SCALE = 1.2;

function densityBand(value: number) {
  return Math.min(DENSITY_STEPS - 1, Math.floor(value * DENSITY_STEPS / 256));
}

/** One path per intensity band. Adjacent cells of the same band share a segment so a finer grid does not multiply SVG commands. */
export function densityPaths(data: Uint8Array, columns: number): string[] {
  const paths = new Array<string>(DENSITY_STEPS).fill('');
  const rows = Math.ceil(data.length / columns);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns;) {
      const index = y * columns + x;
      if (index >= data.length) break;
      const value = data[index];
      if (!value) {x++; continue;}
      const band = densityBand(value);
      let end = x + 1;
      while (end < columns) {
        const nextIndex = y * columns + end;
        const next = nextIndex < data.length ? data[nextIndex] : 0;
        if (!next || densityBand(next) !== band) break;
        end++;
      }
      const width = end - x;
      paths[band] += `M${x} ${y}h${width}v${DENSITY_ROW_HEIGHT}h-${width}z`;
      x = end;
    }
  }
  return paths;
}

function Density({paths, color}: {paths: string[]; color: string}) {
  return <>{paths.map((d, i) => d && <Path key={i} d={d} fill={color} opacity={(i + 1) / DENSITY_STEPS}/>)}</>;
}

/** SVG text does not follow Android's font scale, so keep a dark keyline for bright previews and size the glyphs below. */
function AxisText({x, y, size, color = INK, anchor = 'start', children}: {
  x: number; y: number; size: number; color?: string; anchor?: 'start' | 'middle' | 'end'; children: React.ReactNode;
}) {
  return <>
    <SvgText x={x} y={y} fontSize={size} fill={HALO} stroke={HALO} strokeWidth={size * .2} strokeLinejoin="round" textAnchor={anchor}>{children}</SvgText>
    <SvgText x={x} y={y} fontSize={size} fill={color} textAnchor={anchor}>{children}</SvgText>
  </>;
}

function LevelGrid({axisSize}: {axisSize: number}) {
  return <>
    <Rect x={24} y={6} width={256} height={120} fill="none" stroke={GRID}/>
    {[0, 25, 50, 75, 100].map(level => <Line key={level} x1={24} x2={280} y1={126 - level * 1.2} y2={126 - level * 1.2} stroke={GRID}/>)}
    {[0, 50, 100].map(level => <AxisText key={level} x={20} y={129 - level * 1.2} size={axisSize} anchor="end">{level}</AxisText>)}
  </>;
}

function histogramPaths(data: Uint8Array) {
  return [0, 1, 2, 3].map(channel => {
    let path = 'M24 126';
    for (let bin = 0; bin < SCOPE_SHAPE.histogramBins; bin++) path += `L${24 + bin} ${(126 - data[channel * 256 + bin] * 120 / 255).toFixed(1)}`;
    return path + 'L280 126Z';
  });
}

function vectorTarget(r: number, g: number, b: number) {
  const y = .2126 * r + .7152 * g + .0722 * b;
  return {x: 84 + ((b - y) / 1.8556 + .5) * 120, y: 6 + (.5 - (r - y) / 1.5748) * 120};
}
const TARGETS = [
  {name: 'R', color: RGB[0], ...vectorTarget(.75, 0, 0)},
  {name: 'G', color: RGB[1], ...vectorTarget(0, .75, 0)},
  {name: 'B', color: RGB[2], ...vectorTarget(0, 0, .75)},
  {name: 'Y', color: '#F3E986', ...vectorTarget(.75, .75, 0)},
  {name: 'C', color: '#83ECEF', ...vectorTarget(0, .75, .75)},
  {name: 'M', color: '#EDA2EA', ...vectorTarget(.75, 0, .75)},
];

export default React.memo(function ScopePlot({kind, data, displayWidth = 184, displayHeight = 104}: {kind: ScopeKind; data: ScopeFrame; displayWidth?: number; displayHeight?: number}) {
  // The keyline needs room above the top tick at 100, so the shared view box starts at -16.
  const viewBox = kind === 'vectorscope' ? {x: 0, y: 0, width: 136, height: 150} : {x: -28, y: -16, width: 316, height: 166};
  const plotScale = Math.min(Math.max(1, displayWidth) / viewBox.width, Math.max(1, displayHeight) / viewBox.height);
  // Labels grow with the enlarged chart but never drop below 10sp; cap system scaling so they stay inside the plot.
  const fontScale = Math.min(AXIS_MAX_FONT_SCALE, Math.max(1, PixelRatio.getFontScale()));
  const labelDp = fontScale * Math.min(AXIS_MAX_DP, Math.max(AXIS_MIN_DP, displayWidth * AXIS_MIN_DP / AXIS_REFERENCE_WIDTH));
  const axisSize = labelDp / plotScale;
  const paths = useMemo(() => {
    if (kind === 'histogram') return [histogramPaths(data.histogram)];
    if (kind === 'waveform') return [densityPaths(data.waveform, SCOPE_SHAPE.waveWidth)];
    if (kind === 'vectorscope') return [densityPaths(data.vectorscope, SCOPE_SHAPE.vectorSize)];
    const size = SCOPE_SHAPE.paradeWidth * SCOPE_SHAPE.levels;
    return [0, 1, 2].map(channel => densityPaths(data.parade.subarray(channel * size, (channel + 1) * size), SCOPE_SHAPE.paradeWidth));
  }, [kind, data]);
  return <Svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} accessibilityLabel={`${SCOPE_TITLES[kind]} 实时图表`}>
    {kind === 'histogram' && <>
      <Rect x={24} y={6} width={256} height={120} fill="none" stroke={GRID}/>
      {[64, 128, 192].map(bin => <Line key={bin} x1={24 + bin} x2={24 + bin} y1={6} y2={126} stroke={GRID}/>)}
      {paths[0].map((d, i) => <Path key={i} d={d} fill={i === 3 ? 'none' : RGB[i]} fillOpacity={.13} stroke={i === 3 ? INK : RGB[i]} strokeWidth={1.2}/>)}
      <AxisText x={24} y={139} size={axisSize}>0</AxisText><AxisText x={280} y={139} size={axisSize} anchor="end">255</AxisText>
      {[...RGB, INK].map((color, i) => <AxisText key={color} color={color} x={112 + i * 18} y={144} size={axisSize}>{['R', 'G', 'B', 'Y'][i]}</AxisText>)}
    </>}
    {kind === 'waveform' && <>
      <LevelGrid axisSize={axisSize}/><G transform={`translate(24 6) scale(${256 / SCOPE_SHAPE.waveWidth} ${120 / SCOPE_SHAPE.levels})`}><Density paths={paths[0]} color={INK}/></G>
      <AxisText x={24} y={143} size={axisSize}>L</AxisText><AxisText x={280} y={143} size={axisSize} anchor="end">R</AxisText>
    </>}
    {kind === 'parade' && <>
      <LevelGrid axisSize={axisSize}/>{RGB.map((color, i) => <G key={color}>
        <G transform={`translate(${24 + i * 256 / 3} 6) scale(${256 / 3 / SCOPE_SHAPE.paradeWidth} ${120 / SCOPE_SHAPE.levels})`}><Density paths={paths[i]} color={color}/></G>
        {i > 0 && <Line x1={24 + i * 256 / 3} x2={24 + i * 256 / 3} y1={6} y2={126} stroke={GRID}/>}
        <AxisText x={24 + (i + .5) * 256 / 3} y={143} size={axisSize} color={color} anchor="middle">{['R', 'G', 'B'][i]}</AxisText>
      </G>)}
    </>}
    {kind === 'vectorscope' && <G transform="translate(-76 0)">
      <Circle cx={144} cy={66} r={60} fill="none" stroke={GRID}/>
      <Circle cx={144} cy={66} r={30} fill="none" stroke={GRID}/>
      <Line x1={84} x2={204} y1={66} y2={66} stroke={GRID}/><Line x1={144} x2={144} y1={6} y2={126} stroke={GRID}/>
      <G transform="translate(84 6) scale(1.875)"><Density paths={paths[0]} color={INK}/></G>
      {TARGETS.map(target => <G key={target.name}><Rect x={target.x - 3} y={target.y - 3} width={6} height={6} fill="none" stroke={target.color}/><AxisText x={target.x + 6} y={target.y + 3} size={axisSize} color={target.color}>{target.name}</AxisText></G>)}
      <AxisText x={144} y={143} size={axisSize} anchor="middle">75%</AxisText>
    </G>}
  </Svg>;
});
