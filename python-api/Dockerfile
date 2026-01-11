FROM public.ecr.aws/lambda/python:3.11

# Install deps
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Copy code
COPY lambda_function.py ${LAMBDA_TASK_ROOT}

CMD ["lambda_function.handler"]