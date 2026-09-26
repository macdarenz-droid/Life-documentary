import { rgba, tokens } from '@life/design';
import { words } from '@life/story';
import { Image } from 'expo-image';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Field, Surface, Text, useMotionPreference } from '../src/design-system';
// Motion components are imported by file: GrainBreath needs Skia, which on web loads only after CanvasKit.
import { Dissolve } from '../src/design-system/motion/Dissolve';
import { TextMorph } from '../src/design-system/motion/TextMorph';
import { TitleCard } from '../src/design-system/motion/TitleCard';

/** Lab-only cadences and sample copy (T-003d); not product timing or product words. */
const MORPH_CYCLE_MS = 1500;
const DISSOLVE_CYCLE_MS = 2500;
const SAMPLE = {
  title: ['The Week', 'It Rained'],
  fieldEmpty: 'A note, empty',
  fieldFocused: 'A note, focused',
  fieldFocusedValue: 'Rain on the tram window',
  fieldError: 'A note, with an error',
  fieldErrorText: 'This note is empty',
} as const;
const MORPH_STEPS = [words.button.holdToAnswer, words.button.recording, words.button.saved];
// Metro bundles static images through require(); there are no image module types in this app.
/* eslint-disable @typescript-eslint/no-require-imports */
const FRAMES = [
  { key: 'dusk', source: require('../assets/lab/dusk.png') as number },
  { key: 'dawn', source: require('../assets/lab/dawn.png') as number },
] as const;
/* eslint-enable @typescript-eslint/no-require-imports */

const GrainBreath = lazy(async () => {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
  }
  const mod = await import('../src/design-system/motion/GrainBreath');
  return { default: mod.GrainBreath };
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

type ColourToken = (typeof tokens.color)[keyof typeof tokens.color];

function swatchHex(value: ColourToken): string {
  return typeof value === 'string' ? value : value.hex;
}

/** Translucent tokens show at their alpha; the scrim shows at its darkest stop. */
function swatchFill(value: ColourToken): string {
  if (typeof value === 'string') return value;
  return rgba(value.hex, 'alpha' in value ? value.alpha : value.to);
}

function useCycle(length: number, everyMs: number): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % length), everyMs);
    return () => clearInterval(id);
  }, [length, everyMs]);
  return i;
}

export default function DesignLab() {
  const { reduced } = useMotionPreference();
  const [text, setText] = useState('');
  const [titleRun, setTitleRun] = useState(0);
  const morph = useCycle(MORPH_STEPS.length, MORPH_CYCLE_MS);
  const frame = FRAMES[useCycle(FRAMES.length, DISSOLVE_CYCLE_MS)] ?? FRAMES[0];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="display34">{words.lab.title}</Text>

      <View style={styles.row}>
        {/* The Switch only shows the state; the text line below carries it for screen readers. */}
        <Switch
          value={reduced}
          disabled
          aria-hidden
          trackColor={{ false: tokens.color.surface, true: tokens.color.accent }}
        />
        {reduced ? <Text variant="body">{words.lab.reducedMotionOn}</Text> : null}
      </View>

      <Section title="Colour">
        {Object.entries(tokens.color).map(([name, value]) => (
          <View key={name} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: swatchFill(value) }]} />
            <Text variant="body">{name}</Text>
            <Text variant="timecode" tone="secondary">
              {swatchHex(value)}
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Type">
        {(Object.keys(tokens.type) as (keyof typeof tokens.type)[]).map((variant) => (
          <Text key={variant} variant={variant} accessibilityRole="text">
            {variant}
          </Text>
        ))}
      </Section>

      <Section title="Buttons">
        <Button label={words.button.holdToAnswer} onPress={() => undefined} />
        <Button label={words.button.saved} variant="quiet" onPress={() => undefined} />
        <Button label={words.button.saved} disabled onPress={() => undefined} />
        <Button label={words.button.recording} haptic="impactLight" onPress={() => undefined} />
      </Section>

      <Section title="Field">
        <Field label={SAMPLE.fieldEmpty} value={text} onChangeText={setText} />
        <Field
          label={SAMPLE.fieldFocused}
          value={SAMPLE.fieldFocusedValue}
          onChangeText={() => undefined}
        />
        <Field
          label={SAMPLE.fieldError}
          value=""
          onChangeText={() => undefined}
          error={SAMPLE.fieldErrorText}
        />
      </Section>

      <Section title="Title Card">
        <Surface>
          <TitleCard key={titleRun} lines={[...SAMPLE.title]} variant="display48" play />
        </Surface>
        <Button
          label={words.lab.replay}
          variant="quiet"
          onPress={() => setTitleRun((n) => n + 1)}
        />
      </Section>

      <Section title="Text Morph">
        <TextMorph text={MORPH_STEPS[morph] ?? words.button.holdToAnswer} variant="bodyStrong" />
      </Section>

      <Section title="Dissolve">
        <Dissolve source={frame.source} recyclingKey={frame.key} style={styles.frame} />
      </Section>

      <Section title="Grain and Breath">
        <Suspense fallback={<View style={styles.frame} />}>
          <GrainBreath style={styles.frame}>
            <Image source={FRAMES[0].source} contentFit="cover" style={StyleSheet.absoluteFill} />
          </GrainBreath>
        </Suspense>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[6] },
  section: { gap: tokens.space[3] },
  sectionBody: { gap: tokens.space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] },
  swatch: {
    width: tokens.space[6],
    height: tokens.space[6],
    borderRadius: tokens.radius.sm,
    borderWidth: tokens.border.outline,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
  frame: { aspectRatio: tokens.motion.letterboxAspect, borderRadius: tokens.radius.md },
});
