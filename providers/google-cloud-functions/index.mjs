import { http } from '@google-cloud/functions-framework';
import { handler } from './handler.mjs';

http('almideApi', handler);
