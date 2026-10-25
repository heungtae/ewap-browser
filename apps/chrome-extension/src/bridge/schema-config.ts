import { z } from "zod";
// MV3 forbids dynamic code generation, including validator probes/JIT compilation.
z.config({ jitless: true });
