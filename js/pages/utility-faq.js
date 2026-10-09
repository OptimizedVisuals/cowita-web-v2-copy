/* utility/faq.html — page scripts
   (extracted from an inline <script> block for CSP compliance) */

    /* =========================================================
       FAQ ACCORDION
       ========================================================= */

    document.querySelectorAll(".faq-question").forEach(function (button) {

      button.addEventListener("click", function () {

        const item = button.closest(".faq-item");
        const isOpen = item.classList.contains("open");

        document.querySelectorAll(".faq-item.open").forEach(function (openItem) {

          if (openItem !== item) {

            openItem.classList.remove("open");

            const openButton = openItem.querySelector(".faq-question");

            if (openButton) {
              openButton.setAttribute("aria-expanded", "false");
            }

          }

        });

        item.classList.toggle("open", !isOpen);

        button.setAttribute(
          "aria-expanded",
          String(!isOpen)
        );

      });

    });
  
