// Zeit als injizierbare Abhaengigkeit statt `new Date()` mitten im Regelcode - damit
// Sitzungsablauf und die Halbwertsregel der Verlaengerung deterministisch testbar sind
// (design.md D5).

export type Clock = () => Date

export const systemClock: Clock = () => new Date()
