import { Image } from 'expo-image'
import { treeStage } from '@simplicity/core'
import { themed } from '../../theme/themed'

/* The growing tree in the header — one image per step, from the ten-stage
   asset set shared with web (apps/web/public/onboarding-tree). Which stage
   a step gets is treeStage(), and the two promises it keeps — it ends on
   the canopy, and it only ever grows — are documented there, beside the
   step list it is a function of.

   Metro needs a literal path per require, so the stages are a map rather
   than an interpolated string. Ten entries, and treeStage only ever
   returns 4..10 for a five-step flow — but all ten are here so a change to
   the step count cannot land on a missing key. */
const STAGES = {
  1: require('../../../assets/onboarding-tree/1.png'),
  2: require('../../../assets/onboarding-tree/2.png'),
  3: require('../../../assets/onboarding-tree/3.png'),
  4: require('../../../assets/onboarding-tree/4.png'),
  5: require('../../../assets/onboarding-tree/5.png'),
  6: require('../../../assets/onboarding-tree/6.png'),
  7: require('../../../assets/onboarding-tree/7.png'),
  8: require('../../../assets/onboarding-tree/8.png'),
  9: require('../../../assets/onboarding-tree/9.png'),
  10: require('../../../assets/onboarding-tree/10.png'),
}

export default function OnboardingTree({ stepIndex = 0 }) {
  const source = STAGES[treeStage(stepIndex)] || STAGES[10]
  return (
    <Image
      source={source}
      style={styles.tree}
      contentFit="contain"
      transition={260}
      accessible={false}
    />
  )
}

const styles = themed((c, t) => ({
  tree: { width: 96, height: 96 },
}))
