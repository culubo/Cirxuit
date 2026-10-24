/**
 * duckModel — Microduck's policy contract and how the biped board's servos map
 * onto its joints. Joint order and home pose are read from the policy's own
 * ONNX metadata (joint_names, default_joint_pos).
 */

export const DUCK_JOINTS = [
  "left_hip_yaw", "left_hip_roll", "left_hip_pitch", "left_knee", "left_ankle",
  "neck_pitch", "head_pitch", "head_yaw", "head_roll",
  "right_hip_yaw", "right_hip_roll", "right_hip_pitch", "right_knee", "right_ankle",
] as const;

/** Home pose (rad), in DUCK_JOINTS order: the STAND keyframe. */
export const DUCK_HOME: readonly number[] = [
  0.0, -0.087, -0.458, -0.005, 0.453,
  0.349, 0.349, 0.0, 0.0,
  0.0, 0.087, 0.458, 0.005, -0.453,
];

/**
 * The biped board's four servo connectors, by the joint each one drives
 * (from the parts' descriptions: J2 left hip, J3 left ankle, J4 right hip,
 * J5 right ankle).
 */
export const SERVO_JOINTS: Readonly<Record<string, (typeof DUCK_JOINTS)[number]>> = {
  J2: "left_hip_pitch",
  J3: "left_ankle",
  J4: "right_hip_pitch",
  J5: "right_ankle",
};

/** Index into DUCK_JOINTS for a servo ref, or null if it drives no joint. */
export function servoJoint(ref: string): number | null {
  const name = SERVO_JOINTS[ref];
  return name ? DUCK_JOINTS.indexOf(name) : null;
}

/**
 * World gravity (0, 0, −1) expressed in the body frame of a unit quaternion
 * (w, x, y, z): the "projected gravity" the IMU-based policy observes.
 */
export function gravityInBody(w: number, x: number, y: number, z: number): [number, number, number] {
  return [-2 * (x * z - w * y), -2 * (y * z + w * x), -(1 - 2 * (x * x + y * y))];
}
