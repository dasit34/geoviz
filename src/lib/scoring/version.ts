/**
 * GeoViz deterministic scoring engine — version constant.
 *
 * Every persisted `DeterministicScore` carries this string in its
 * `scoring_version` field, and the `AuditIntelligence.scoringVersion`
 * column is set to this value on every new audit. Legacy rows that
 * predate the deterministic engine keep their old `"Calibration v2.2"`
 * string.
 *
 * Bump the patch when fixing scoring bugs without rubric changes.
 * Bump the minor when adjusting weights / ladder anchors (must be
 * called out in CLAUDE.md "Scoring Freeze").
 * Bump the major when restructuring the public output shape.
 */
export const SCORING_VERSION = "scoring@1.0.0";
