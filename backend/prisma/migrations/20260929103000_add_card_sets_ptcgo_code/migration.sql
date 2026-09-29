-- El código impreso de 3 caracteres en la esquina inferior izquierda de la
-- carta ("30C"). Es la señal de set más barata que hay: texto contra un
-- vocabulario cerrado, sin banco de plantillas ni comparación de imágenes.
--
-- El índice es un btree común y lo modela el schema.prisma: no es un objeto
-- que Prisma no conozca, así que `prisma migrate dev` no lo va a dropear.
ALTER TABLE "card_sets" ADD COLUMN "ptcgoCode" TEXT;

CREATE INDEX "card_sets_ptcgoCode_idx" ON "card_sets"("ptcgoCode");
