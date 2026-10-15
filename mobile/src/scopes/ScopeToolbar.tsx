import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from '../CameraControl';
import CameraIcon from '../CameraIcon';
import CameraSheet from '../CameraSheet';
import {ui} from '../theme';
import {changeScopePanel} from './useScopes';
import {ScopePanelState, SCOPE_KINDS, SCOPE_TITLES} from './panelState';

export default function ScopeToolbar({panels}: {panels: ScopePanelState; landscape: boolean}) {
  const [picker, setPicker] = useState(false);
  const open = SCOPE_KINDS.some(kind => panels[kind].open);
  return <>
    <CameraControl icon="scopes" label="示波器" accessibilityLabel="示波器" active={open} onPress={() => setPicker(true)}/>
    <CameraSheet visible={picker} title="示波器" onClose={() => setPicker(false)}>
      {SCOPE_KINDS.map(kind => <Pressable key={kind} testID={`scope-option-${kind}`} accessibilityRole="checkbox" accessibilityLabel={SCOPE_TITLES[kind]} accessibilityState={{checked: panels[kind].open}} onPress={() => changeScopePanel({type: 'toggle', kind})} style={({pressed}) => [styles.option, panels[kind].open && styles.selected, pressed && styles.pressed]}>
        <View style={styles.optionText}><Text style={[styles.title, panels[kind].open && styles.active]}>{SCOPE_TITLES[kind]}</Text></View>
        {panels[kind].open && <CameraIcon name="check" active/>}
      </Pressable>)}
    </CameraSheet>
  </>;
}
const styles = StyleSheet.create({
  title: {...ui.type.body, color: ui.color.text}, active: {color: ui.color.accent},
  option: {minHeight: 56, padding: ui.space.md, flexDirection: 'row', alignItems: 'center', gap: ui.space.md, borderRadius: ui.radius.control},
  selected: {backgroundColor: ui.color.selected}, optionText: {flex: 1}, pressed: {backgroundColor: ui.color.raised},
});
