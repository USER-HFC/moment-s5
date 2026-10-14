import React, {useMemo} from 'react';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {ScopeKind, SCOPE_TITLES} from './panelState';
import {ScopeFrame, SCOPE_SHAPE} from './protocol';

const RGB = ['#FF6B70', '#65ED99', '#6EA9FF'];
const INK = '#DCE7D1';
const GRID = '#FFFFFF24';
const DENSITY_STEPS = 6;

/** One path per intensity band, rather than thousands of React/SVG rect nodes. */
export function densityPaths(data: Uint8Array, columns: number): string[] {
  const paths = new Array<string>(DENSITY_STEPS).fill('');
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value) paths[Math.min(DENSITY_STEPS - 1, Math.floor(value * DENSITY_STEPS / 256))] +=
      `M${i % columns} ${Math.floor(i / columns)}h1v1h-1z`;
  }
  return paths;
}

function Density({paths, color}: {paths: string[]; color: string}) {
  return <>{paths.map((d, i) => d && <Path key={i} d={d} fill={color} opacity={(i + 1) / DENSITY_STEPS}/>)}</>;
}

function LevelGrid() {
  return <>
    <Rect x={24} y={6} width={256} height={120} fill="#05090855" stroke={GRID}/>
    {[0, 25, 50, 75, 100].map(level => <Line key={level} x1={24} x2={280} y1={126 - level * 1.2} y2={126 - level * 1.2} stroke={GRID}/>)}
    {[0, 50, 100].map(level => <SvgText key={level} x={20} y={129 - level * 1.2} fontSize={9} textAnchor="end" fill={INK}>{level}</SvgText>)}
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

export default React.memo(function ScopePlot({kind, data}: {kind: ScopeKind; data: ScopeFrame}) {
  const paths = useMemo(() => {
    if (kind === 'histogram') return [histogramPaths(data.histogram)];
    if (kind === 'waveform') return [densityPaths(data.waveform, SCOPE_SHAPE.waveWidth)];
    if (kind === 'vectorscope') return [densityPaths(data.vectorscope, SCOPE_SHAPE.vectorSize)];
    const size = SCOPE_SHAPE.paradeWidth * SCOPE_SHAPE.levels;
    return [0, 1, 2].map(channel => densityPaths(data.parade.subarray(channel * size, (channel + 1) * size), SCOPE_SHAPE.paradeWidth));
  }, [kind, data]);
  return <Svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" viewBox={kind === 'vectorscope' ? '0 0 136 150' : kind === 'histogram' ? '0 0 288 166' : '0 0 288 150'} accessibilityLabel={`${SCOPE_TITLES[kind]} 实时图表`}>
    {kind === 'histogram' && <>
      <Rect x={24} y={6} width={256} height={120} fill="#05090855" stroke={GRID}/>
      {[64, 128, 192].map(bin => <Line key={bin} x1={24 + bin} x2={24 + bin} y1={6} y2={126} stroke={GRID}/>)}
      {paths[0].map((d, i) => <Path key={i} d={d} fill={i === 3 ? 'none' : RGB[i]} fillOpacity={.13} stroke={i === 3 ? INK : RGB[i]} strokeWidth={1.2}/>)}
      <SvgText x={24} y={139} fill={INK} fontSize={9}>0</SvgText><SvgText x={280} y={139} textAnchor="end" fill={INK} fontSize={9}>255</SvgText>
      {[...RGB, INK].map((color, i) => <SvgText key={color} x={112 + i * 18} y={144} fill={color} fontSize={10}>{['R', 'G', 'B', 'Y'][i]}</SvgText>)}
      <SvgText x={152} y={160} textAnchor="middle" fill={INK} fontSize={9}>触底 {(data.clipLow / data.pixels * 100).toFixed(1)}% · 触顶 {(data.clipHigh / data.pixels * 100).toFixed(1)}%</SvgText>
    </>}
    {kind === 'waveform' && <>
      <LevelGrid/><G transform="translate(24 6) scale(4 1.875)"><Density paths={paths[0]} color={INK}/></G>
      <SvgText x={24} y={143} fill={INK} fontSize={9}>画面左</SvgText><SvgText x={280} y={143} textAnchor="end" fill={INK} fontSize={9}>画面右</SvgText>
    </>}
    {kind === 'parade' && <>
      <LevelGrid/>{RGB.map((color, i) => <G key={color}>
        <G transform={`translate(${24 + i * 256 / 3} 6) scale(${256 / 3 / 32} 1.875)`}><Density paths={paths[i]} color={color}/></G>
        {i > 0 && <Line x1={24 + i * 256 / 3} x2={24 + i * 256 / 3} y1={6} y2={126} stroke={GRID}/>}
        <SvgText x={24 + (i + .5) * 256 / 3} y={143} textAnchor="middle" fill={color} fontSize={10}>{['R', 'G', 'B'][i]}</SvgText>
      </G>)}
    </>}
    {kind === 'vectorscope' && <G transform="translate(-76 0)">
      <Circle cx={144} cy={66} r={60} fill="#05090855" stroke={GRID}/>
      <Circle cx={144} cy={66} r={30} fill="none" stroke={GRID}/>
      <Line x1={84} x2={204} y1={66} y2={66} stroke={GRID}/><Line x1={144} x2={144} y1={6} y2={126} stroke={GRID}/>
      <G transform="translate(84 6) scale(1.875)"><Density paths={paths[0]} color={INK}/></G>
      {TARGETS.map(target => <G key={target.name}><Rect x={target.x - 3} y={target.y - 3} width={6} height={6} fill="none" stroke={target.color}/><SvgText x={target.x + 6} y={target.y + 3} fontSize={9} fill={target.color}>{target.name}</SvgText></G>)}
      <SvgText x={144} y={143} textAnchor="middle" fill={INK} fontSize={9}>75% 色标</SvgText>
    </G>}
  </Svg>;
});
