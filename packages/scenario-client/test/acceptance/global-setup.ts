import { scenarioGlobalSetup } from '@response-capture/scenario-client/playwright';

export default scenarioGlobalSetup({ outputDirectory: process.env['HARNESS_OUTPUT_DIRECTORY']! });
