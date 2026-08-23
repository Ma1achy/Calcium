# The reference renderers — matplotlib, seaborn, and drawilleplot.
#
# **Never installed into `calcium-dev`.** That container has no pip and no venv,
# and adding a Python toolchain to the development image to run a comparison
# would put 400 MB of scientific stack behind every `make check`. This is a
# throwaway built on demand by `make refdiff` and used by nothing else.
#
# `drawilleplot` is a *matplotlib backend* rather than a plotting library:
# `matplotlib.use("module://drawilleplot")` makes `plt.show()` emit braille to
# stdout. That is what lets the comparison be a text diff — the same figure, the
# same fixture, one rendered by us and one by matplotlib, both as characters.
FROM python:3.12-slim
RUN pip install --no-cache-dir -q \
      matplotlib==3.9.2 \
      seaborn==0.13.2 \
      numpy==2.1.3 \
      drawille==0.1.0 \
      drawilleplot==0.1.0 \
      pillow==10.4.0
WORKDIR /work
