// This is a server action.
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating descriptions for each column in a CSV dataset.
 *
 * generateColumnDescriptions - A function that takes CSV data and returns descriptions for each column.
 * GenerateColumnDescriptionsInput - The input type for the generateColumnDescriptions function.
 * GenerateColumnDescriptionsOutput - The output type for the generateColumnDescriptions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateColumnDescriptionsInputSchema = z.object({
  csvData: z.string().describe('The CSV data to analyze.'),
});
export type GenerateColumnDescriptionsInput = z.infer<typeof GenerateColumnDescriptionsInputSchema>;

const GenerateColumnDescriptionsOutputSchema = z.record(z.string(), z.string()).describe('A map of column names to descriptions.');
export type GenerateColumnDescriptionsOutput = z.infer<typeof GenerateColumnDescriptionsOutputSchema>;

export async function generateColumnDescriptions(input: GenerateColumnDescriptionsInput): Promise<GenerateColumnDescriptionsOutput> {
  return generateColumnDescriptionsFlow(input);
}

const columnDescriptionPrompt = ai.definePrompt({
  name: 'columnDescriptionPrompt',
  input: {schema: GenerateColumnDescriptionsInputSchema},
  output: {schema: GenerateColumnDescriptionsOutputSchema},
  prompt: `You are an expert data analyst. Your task is to generate descriptions for each column in a given CSV dataset.

  Here is the CSV data:
  {{csvData}}

  For each column, provide a concise description of the data it contains, including the data type (e.g., string, number, boolean), 
  the range of values (if applicable), and the potential meaning or purpose of the column.

  The output should be a JSON object where the keys are the column names and the values are the corresponding descriptions.
  Ensure the JSON is valid and can be parsed without errors.

  Example:
  {
    "CustomerID": "A unique identifier for each customer (integer).",
    "Name": "The name of the customer (string).",
    "OrderDate": "The date when the order was placed (date).",
    "Amount": "The total amount of the order (number)."
  }

  Follow the format of the example above.
  Make sure to surround column names with quotations.
  Do not add any additional text. Just the JSON.`, 
});

const generateColumnDescriptionsFlow = ai.defineFlow(
  {
    name: 'generateColumnDescriptionsFlow',
    inputSchema: GenerateColumnDescriptionsInputSchema,
    outputSchema: GenerateColumnDescriptionsOutputSchema,
  },
  async input => {
    const {output} = await columnDescriptionPrompt(input);
    return output!;
  }
);
