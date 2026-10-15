import React from 'react';
import {SvgXml} from 'react-native-svg';
import {ui} from '../theme';

const paths = {
  move: 'M10 2v16M2 10h16M7.5 4.5 10 2l2.5 2.5M7.5 15.5 10 18l2.5-2.5M4.5 7.5 2 10l2.5 2.5M15.5 7.5 18 10l-2.5 2.5',
  enlarge: 'M12 2h6v6M18 2l-6 6M2 12v6h6M2 18l6-6',
  shrink: 'M18 2l-6 6m0-5v5h5M2 18l6-6m-5 0h5v5',
  close: 'M3 3l14 14M3 17 17 3',
};

/** 16dp optical strokes in a 20dp box; a soft keyline survives bright preview pixels. */
export default function ScopeControlIcon({name, active = false}: {name: keyof typeof paths; active?: boolean}) {
  const path = `<path d="${paths[name]}"/>`;
  return <SvgXml accessible={false} pointerEvents="none" testID={`scope-icon-${name}`} width={20} height={20}
    xml={`<svg viewBox="0 0 20 20" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#00000080" stroke-width="3">${path}</g><g stroke="${active ? ui.color.accent : ui.color.text}" stroke-width="1.4">${path}</g></svg>`}/>;
}
