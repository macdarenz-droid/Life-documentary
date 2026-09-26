import { words } from '@life/story';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { migrate } from '../data/migrations';
import { openMemoryDriver } from '../data/sqlite/testing/memoryDriver';
import { fakeServices } from '../services/testing/fakeServices';
import { CaptureRoot, useCapture, type OpenedStore } from './captureContext';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

function Title() {
  const { documentary } = useCapture();
  return <Text>{documentary.title}</Text>;
}

describe('CaptureRoot', () => {
  it('renders its children with the local documentary once the store is open', async () => {
    const open = async (): Promise<OpenedStore> => ({
      store: await memoryStore(),
      clock: fixedClock('2027-03-15T09:30:00Z'),
      ids: sequentialIds(),
      timeZone: 'Europe/Berlin',
    });
    await render(
      <CaptureRoot open={open} services={fakeServices()}>
        <Title />
      </CaptureRoot>,
    );
    expect(await screen.findByText(words.documentary.defaultTitle)).toBeOnTheScreen();
  });

  it('shows the opening error words when migrate throws', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const open = async (): Promise<OpenedStore> => {
      await migrate(await openMemoryDriver(), '2027-03-15T09:30:00Z', [
        { version: 2, name: 'gap', sql: '' },
      ]);
      throw new Error('unreachable');
    };
    await render(
      <CaptureRoot open={open} services={fakeServices()}>
        <Title />
      </CaptureRoot>,
    );
    expect(await screen.findByText(words.permissions.openError)).toBeOnTheScreen();
    expect(screen.queryByText(words.documentary.defaultTitle)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
