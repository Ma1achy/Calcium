// **Production React, before `ink` is evaluated** (F853's reason, the bench's
// side). `react-reconciler` picks its build from `process.env.NODE_ENV` when
// its body runs, and the development build measures every commit into a
// buffer Node never releases — so a bench that sets nothing profiles React's
// own instrumentation and reports it as Calcium's frame. The launchers set
// this line before their dynamic import; here it is the first import, and
// ESM evaluates imports in order, so it runs before `dist/` and everything
// under it. `??=`, so a deliberate setting from outside is kept.
process.env.NODE_ENV ??= "production";
