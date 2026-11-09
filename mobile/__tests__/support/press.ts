import renderer, {act} from 'react-test-renderer';

export const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByProps({accessibilityLabel: label}).find(node => typeof node.props.onPress === 'function');

/**
 * Presses the control a user would reach by that label. Capture controls live in the drawer,
 * so when the label is not on screen the drawer toggle is pressed first, in its own act.
 */
export function pressLabel(tree: renderer.ReactTestRenderer, label: string) {
  if (!pressable(tree, label)) {
    const toggle = pressable(tree, '拍摄控制');
    if (toggle) act(() => toggle.props.onPress());
  }
  const target = pressable(tree, label);
  if (!target) throw new Error(`No control labelled「${label}」`);
  act(() => target.props.onPress());
}
