const React = require('react');
const { Pressable, Text, TextInput, View } = require('react-native');

function HeroUINativeProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

const TabsContext = React.createContext(null);

function TabsRoot({ children, onValueChange, value, ...props }) {
  return React.createElement(
    TabsContext.Provider,
    { value: { onValueChange, value } },
    React.createElement(View, props, children),
  );
}

function TabsTrigger({ children, isDisabled = false, onPress, value, ...props }) {
  const context = React.use(TabsContext);
  const isSelected = context?.value === value;
  const content = typeof children === 'function'
    ? children({ isDisabled, isSelected, value })
    : children;

  return React.createElement(
    Pressable,
    {
      ...props,
      accessibilityRole: props.accessibilityRole ?? 'tab',
      accessibilityState: { disabled: isDisabled, selected: isSelected },
      disabled: isDisabled,
      onPress: (event) => {
        if (!isDisabled) context?.onValueChange?.(value);
        onPress?.(event);
      },
    },
    content,
  );
}

const Tabs = Object.assign(TabsRoot, {
  Indicator: View,
  Label: Text,
  List: View,
  Trigger: TabsTrigger,
});

const SearchFieldContext = React.createContext(null);

function SearchFieldRoot({ children, onChange, value, ...props }) {
  return React.createElement(
    SearchFieldContext.Provider,
    { value: { onChange, value } },
    React.createElement(View, props, children),
  );
}

function SearchFieldInput({ onChangeText, value, ...props }) {
  const context = React.use(SearchFieldContext);
  return React.createElement(TextInput, {
    ...props,
    onChangeText: context?.onChange ?? onChangeText,
    value: context?.value ?? value,
  });
}

function SearchFieldClearButton({ children, onPress, ...props }) {
  const context = React.use(SearchFieldContext);
  if (!context?.value) return null;
  return React.createElement(
    Pressable,
    {
      ...props,
      accessibilityLabel: props.accessibilityLabel ?? 'Clear search',
      accessibilityRole: 'button',
      onPress: (event) => {
        context.onChange?.('');
        onPress?.(event);
      },
    },
    children,
  );
}

const SearchField = Object.assign(SearchFieldRoot, {
  ClearButton: SearchFieldClearButton,
  Group: View,
  Input: SearchFieldInput,
  SearchIcon: View,
});

function PressableFeedback({ children, isDisabled = false, ...props }) {
  return React.createElement(Pressable, { ...props, disabled: isDisabled }, children);
}

module.exports = {
  HeroUINativeProvider,
  PressableFeedback,
  SearchField,
  Tabs,
};
