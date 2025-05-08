'use server';

/**
 * @fileOverview This file defines a Genkit flow that suggests data transformations
 * based on the CSV column headers.
 *
 * - suggestTransformations - A function that suggests data transformations.
 * - SuggestTransformationsInput - The input type for the suggestTransformations function.
 * - SuggestTransformationsOutput - The return type for the suggestTransformations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTransformationsInputSchema = z.object({
  columnHeaders: z.array(z.string()).describe('An array of column headers from the CSV file.'),
});
export type SuggestTransformationsInput = z.infer<
  typeof SuggestTransformationsInputSchema
>;

const SuggestTransformationsOutputSchema = z.object({
  transformations: z
    .array(z.string())
    .describe(
      'An array of suggested data transformations based on the column headers.'
    ),
});
export type SuggestTransformationsOutput = z.infer<
  typeof SuggestTransformationsOutputSchema
>;

export async function suggestTransformations(
  input: SuggestTransformationsInput
): Promise<SuggestTransformationsOutput> {
  return suggestTransformationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestTransformationsPrompt',
  input: {schema: SuggestTransformationsInputSchema},
  output: {schema: SuggestTransformationsOutputSchema},
  prompt: `Based on these CSV column headers:\n{{#each columnHeaders}}\n- {{{this}}}{{/each}}\n\nsuggest a list of data transformations that might be useful. Be specific and include the transformation needed, and which columns it applies to.\n\nPossible transformations include:
- Converting Latitude/Longitude from DMS to Decimal Degrees (DD)
- Converting UTM to Lat/Lon
- Normalizing URLs by Island
\nReturn the transformations as a list of strings.
`,
});

const suggestTransformationsFlow = ai.defineFlow(
  {
    name: 'suggestTransformationsFlow',
    inputSchema: SuggestTransformationsInputSchema,
    outputSchema: SuggestTransformationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
