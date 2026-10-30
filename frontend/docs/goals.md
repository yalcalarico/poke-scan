# Objetivos de colección

El cliente llama a las cuatro rutas documentadas en
`../../backend/docs/collection-goals.md`; rechaza respuestas ilegibles y propaga
fallos.

El límite de título se cuenta en codepoints Unicode en backend, editor y lector de respuestas. No se usa maxlength HTML de 120 unidades UTF-16: truncaría emojis válidos. Los títulos de 121 codepoints se rechazan sin modificar objetivo ni próximo.
