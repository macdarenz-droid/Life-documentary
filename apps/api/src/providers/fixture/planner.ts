// A planner for tests and local dev. A test queues the answers (a valid plan, an invalid one, a refusal,
// a cut-off answer or an error to throw); each call records its request and takes the next one.
import type { PlanAnswer, PlanRequest, Planner } from '../../pipeline/ports';

export type FixturePlanner = Planner & {
  /** Every request, in order. */
  calls: PlanRequest[];
  /** What the next calls give back, in order; an Error is thrown. */
  answers: (PlanAnswer | Error)[];
  reset(): void;
};

export const NO_FIXTURE_ANSWER = 'No fixture answer';

export function fixturePlanner(): FixturePlanner {
  const fixture: FixturePlanner = {
    calls: [],
    answers: [],
    plan(request) {
      return Promise.resolve().then(() => {
        fixture.calls.push(request);
        const answer = fixture.answers.shift();
        if (answer === undefined) throw new Error(NO_FIXTURE_ANSWER);
        if (answer instanceof Error) throw answer;
        return answer;
      });
    },
    reset() {
      fixture.calls.length = 0;
      fixture.answers.length = 0;
    },
  };
  return fixture;
}
