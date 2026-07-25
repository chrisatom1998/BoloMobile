import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

import { AppErrorBoundary } from '../src/components/app-error-boundary';
import { observe } from '../src/lib/observability';

const observeMock = observe as jest.MockedFunction<typeof observe>;

// React retries a failed render before committing the fallback, so the child has
// to keep throwing until the test explicitly clears the flag.
function Unstable({ failing }: { failing: { value: boolean } }) {
  if (failing.value) throw new Error('Render exploded.');
  return <Text>Recovered content</Text>;
}

describe('AppErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children while nothing throws', async () => {
    const view = await render(<AppErrorBoundary><Text>Healthy content</Text></AppErrorBoundary>);

    expect(view.getByText('Healthy content')).toBeTruthy();
    expect(view.queryByText('Bolo needs a fresh start')).toBeNull();
    expect(observeMock).not.toHaveBeenCalled();
  });

  it('shows an accessible fallback and reports the failure once a child throws', async () => {
    const view = await render(
      <AppErrorBoundary><Unstable failing={{ value: true }} /></AppErrorBoundary>,
    );

    expect(view.getByText('Bolo needs a fresh start').parent?.props.accessibilityRole).toBe('alert');
    expect(view.getByText(/Your saved progress is still on this device/u)).toBeTruthy();
    expect(observeMock).toHaveBeenCalledWith('runtime_error');
  });

  it('recovers the tree when the learner retries', async () => {
    const failing = { value: true };
    const view = await render(<AppErrorBoundary><Unstable failing={failing} /></AppErrorBoundary>);
    expect(view.getByText('Bolo needs a fresh start').parent?.props.accessibilityRole).toBe('alert');

    failing.value = false;
    await fireEvent.press(view.getByRole('button', { name: 'Try again' }));

    expect(view.getByText('Recovered content')).toBeTruthy();
    expect(view.queryByText('Bolo needs a fresh start')).toBeNull();
  });
});
